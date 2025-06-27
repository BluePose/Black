require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// ===================================================================================
// 설정 (Configuration)
// ===================================================================================
const config = {
    PORT: process.env.PORT || 3000,
    AI_PASSWORD: '5001',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    API_REQUEST_TIMEOUT: 30000,
    MEETING_MINUTES_MAX_TOKENS: 4096,
    AI_RESPONSE_BASE_DELAY: 4000,
    AI_RESPONSE_RANDOM_DELAY: 2000,
    LOG_FILE_PATH: path.join(__dirname, 'chat.log'),
    CONTEXT_SUMMARY_INTERVAL: 120000, // 2분마다 대화 주제 요약
    MODERATOR_INTERVAL: 180000, // 3분마다 사회자 개입
    MODERATOR_TURN_COUNT: 8, // 8턴마다 사회자 개입
    MAX_CONTEXT_LENGTH: 25, // AI의 단기 기억(컨텍스트) 최대 길이
    TARGET_CONTEXT_LENGTH: 15, // 압축 후 목표 컨텍스트 길이
};

if (!config.GOOGLE_API_KEY) {
    console.error('Google API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.');
    process.exit(1);
}

const logStream = fs.createWriteStream(config.LOG_FILE_PATH, { flags: 'a' });

// ===================================================================================
// 대화 맥락 관리 (Conversation Context)
// ===================================================================================
class ConversationContext {
    constructor() {
        this.fullHistory = []; // 회의록용 전체 대화 기록 (요약되지 않음)
        this.contextualHistory = []; // AI 답변용 단기 대화 기록 (요약됨)
        this.topicSummary = "대화가 시작되었습니다.";
        this.isSummarizing = false; // 중복 요약 방지 플래그
    }

    addMessage(msgObj) {
        const mentionRegex = /@(\w+)/g;
        const mentions = [...msgObj.content.matchAll(mentionRegex)].map(m => m[1]);
        
        let replyToId = null;
        if (mentions.length > 0) {
            const mentionedUser = mentions[0];
            const recentMessages = [...this.fullHistory].reverse();
            const repliedMessage = recentMessages.find(m => m.from === mentionedUser);
            if (repliedMessage) {
                replyToId = repliedMessage.id;
            }
        }

        const messageWithContext = { ...msgObj, replyToId };

        // 두 기록에 모두 메시지 추가
        this.fullHistory.push(messageWithContext);
        this.contextualHistory.push(messageWithContext);
        
        logStream.write(JSON.stringify(messageWithContext) + '\n');
        
        // 컨텍스트 길이 확인 및 비동기적 요약 실행
        if (this.contextualHistory.length > config.MAX_CONTEXT_LENGTH && !this.isSummarizing) {
            this.summarizeAndCompressContextualHistory(); // await 하지 않음 (백그라운드 실행)
        }
    }

    getContextualHistorySnapshot() {
        return [...this.contextualHistory];
    }
    
    getFullHistorySnapshot() {
        return [...this.fullHistory];
    }

    async summarizeAndCompressContextualHistory() {
        this.isSummarizing = true;
        console.log(`[메모리 압축] 컨텍스트 기록(${this.contextualHistory.length})이 임계값을 초과하여, 압축을 시작합니다.`);

        try {
            const numToSummarize = config.MAX_CONTEXT_LENGTH - config.TARGET_CONTEXT_LENGTH + 1;
            if (this.contextualHistory.length < numToSummarize) {
                return;
            }
            
            const toSummarize = this.contextualHistory.slice(0, numToSummarize);
            const remainingHistory = this.contextualHistory.slice(numToSummarize);

            const conversationToSummarize = toSummarize.map(m => `${m.from}: ${m.content}`).join('\n');
            const prompt = `다음은 긴 대화의 일부입니다. 이 대화의 핵심 내용을 단 한 문장으로 요약해주세요: \n\n${conversationToSummarize}`;

            // 요약을 위해 기존 모델 사용 (추가 비용 없음)
            const result = await model.generateContent(prompt);
            const summaryText = (await result.response).text().trim();

            const summaryMessage = {
                id: `summary_${Date.now()}`,
                from: 'System',
                content: `(요약) ${summaryText}`,
                timestamp: toSummarize[toSummarize.length - 1].timestamp, // 마지막 메시지 시점
                type: 'summary'
            };

            this.contextualHistory = [summaryMessage, ...remainingHistory];
            console.log(`[메모리 압축] 압축 완료. 현재 컨텍스트 기록 길이: ${this.contextualHistory.length}`);
        } catch (error) {
            console.error('[메모리 압축] 기록 요약 중 오류 발생:', error);
            // 요약 실패 시, 가장 오래된 기록을 단순히 잘라내서 무한 루프 방지
            this.contextualHistory.splice(0, config.MAX_CONTEXT_LENGTH - config.TARGET_CONTEXT_LENGTH + 1);
        } finally {
            this.isSummarizing = false;
        }
    }

    setTopicSummary(summary) {
        this.topicSummary = summary;
        console.log(`[맥락 업데이트] 새로운 대화 주제: ${summary}`);
    }
}
const conversationContext = new ConversationContext();

// ===================================================================================
// 전역 상태 관리
// ===================================================================================
const users = new Map();
const usersByName = new Map();
const aiStyles = new Map();
const aiMemories = new Map();
const participantRoles = new Map(); // <username, role>

const turnQueue = [];
let isProcessingTurn = false;
let isConversationPausedForMeetingNotes = false; // 회의록 작성 중 AI 대화 일시 중지 플래그

// 사회자 관련 상태
let moderatorTurnCount = 0; // 사회자 개입 턴 카운터
let lastModeratorTime = Date.now(); // 마지막 사회자 개입 시간
let lastModeratorDirective = null; // 최근 사회자 지시사항
let moderatorDirectiveExpiry = 0; // 지시 유효 시간
const DIRECTIVE_DURATION = 10000; // 10초간 지시 유효

const SOCKET_EVENTS = {
    CONNECTION: 'connection', DISCONNECT: 'disconnect', JOIN: 'join',
    JOIN_SUCCESS: 'join_success', JOIN_ERROR: 'join_error', CHAT_MESSAGE: 'chat_message',
    MESSAGE: 'message', USER_LIST: 'userList',
};

const AI_ROLES = {
    SCRIBE: 'Scribe',
    MODERATOR: 'Moderator',
    PARTICIPANT: 'Participant'
};



// ===================================================================================
// Google Gemini API 설정
// ===================================================================================
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY);
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const MODEL_NAME = "gemini-1.5-flash-latest";

const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    safetySettings
}, { apiVersion: 'v1beta' });

const searchTool = [{ "google_search_retrieval": {} }];

// ===================================================================================
// 핵심 로직 함수들
// ===================================================================================
function logMessage(msgObj) {
    conversationContext.addMessage(msgObj);
}

function assignScribeRole() {
    const currentScribe = findUserByRole('Scribe');
    if (currentScribe) return;

    const aiUsers = Array.from(users.values()).filter(u => u.isAI);
    if (aiUsers.length > 0) {
        const newScribe = aiUsers.sort((a,b) => a.joinTime - b.joinTime)[0];
        participantRoles.set(newScribe.username, 'Scribe');
        console.log(`[역할 할당] ${newScribe.username}에게 'Scribe' 역할이 부여되었습니다.`);
    }
}

function assignModeratorRole() {
    const currentModerator = findUserByRole(AI_ROLES.MODERATOR);
    if (currentModerator) return;

    const aiUsers = Array.from(users.values()).filter(u => u.isAI);
    const scribe = findUserByRole(AI_ROLES.SCRIBE);
    
    // Scribe가 아닌 AI 중에서 선택
    const availableAIs = aiUsers.filter(ai => ai.username !== scribe?.username);
    
    if (availableAIs.length > 0) {
        const newModerator = availableAIs.sort((a,b) => a.joinTime - b.joinTime)[0];
        participantRoles.set(newModerator.username, AI_ROLES.MODERATOR);
        console.log(`[역할 할당] ${newModerator.username}에게 'Moderator' 역할이 부여되었습니다.`);
    }
}

function reassignModeratorRole() {
    const aiUsers = Array.from(users.values()).filter(u => u.isAI);
    const scribe = findUserByRole(AI_ROLES.SCRIBE);
    
    // 현재 사회자 제거
    for (const [username, role] of participantRoles.entries()) {
        if (role === AI_ROLES.MODERATOR) {
            participantRoles.delete(username);
        }
    }
    
    // 새 사회자 할당 (Scribe가 아닌 AI 중에서)
    const availableAIs = aiUsers.filter(ai => ai.username !== scribe?.username);
    
    if (availableAIs.length > 0) {
        const newModerator = availableAIs.sort((a,b) => a.joinTime - b.joinTime)[0];
        participantRoles.set(newModerator.username, AI_ROLES.MODERATOR);
        console.log(`[역할 재할당] ${newModerator.username}에게 'Moderator' 역할이 재할당되었습니다.`);
    }
}

function findUserByRole(role) {
    for (const [username, userRole] of participantRoles.entries()) {
        if (userRole === role) {
            return usersByName.get(username);
        }
    }
    return null;
}

function getParticipantNames() {
    return Array.from(usersByName.keys());
}

function shouldModeratorIntervene() {
    const timeSinceLastModerator = Date.now() - lastModeratorTime;
    const turnCountReached = moderatorTurnCount >= config.MODERATOR_TURN_COUNT;
    const timeIntervalReached = timeSinceLastModerator >= config.MODERATOR_INTERVAL;
    
    return turnCountReached || timeIntervalReached;
}

function resetModeratorTimer() {
    moderatorTurnCount = 0;
    lastModeratorTime = Date.now();
}

function extractModeratorDirective(moderatorMessage) {
    try {
        // "다음 주제:" 부분 추출
        const nextTopicMatch = moderatorMessage.match(/🔹\s*\*\*다음\s*주제\*\*:\s*\[([^\]]+)\]/i) || 
                              moderatorMessage.match(/다음\s*주제[:\s]*([^\n]+)/i);
        
        // "주목할 의견:" 부분 추출  
        const highlightMatch = moderatorMessage.match(/🔹\s*\*\*주목할\s*의견\*\*:\s*\[([^\]]+)\]/i) ||
                              moderatorMessage.match(/주목할\s*의견[:\s]*([^\n]+)/i);
        
        // "요약:" 부분 추출
        const summaryMatch = moderatorMessage.match(/🔹\s*\*\*요약\*\*:\s*\[([^\]]+)\]/i) ||
                            moderatorMessage.match(/요약[:\s]*([^\n]+)/i);

        if (nextTopicMatch || highlightMatch || summaryMatch) {
            return {
                nextTopic: nextTopicMatch ? nextTopicMatch[1].trim() : null,
                highlight: highlightMatch ? highlightMatch[1].trim() : null,
                summary: summaryMatch ? summaryMatch[1].trim() : null,
                fullMessage: moderatorMessage,
                timestamp: Date.now()
            };
        }
        return null;
    } catch (error) {
        console.error('[지시사항 추출] 오류:', error);
        return null;
    }
}





async function generateModeratorResponse(context, moderatorName) {
    try {
        // 처음 주제 파악을 위해 처음 5개 + 최근 10개 메시지를 포함
        let relevantHistory = [];
        
        if (context.length <= 15) {
            // 전체 대화가 15개 이하면 모든 메시지 포함
            relevantHistory = context;
        } else {
            // 처음 5개 + 최근 10개 메시지 포함
            const initialMessages = context.slice(0, 5);
            const recentMessages = context.slice(-10);
            relevantHistory = [...initialMessages, ...recentMessages];
        }
        
        const conversationSummary = relevantHistory.map(m => `${m.from}: ${m.content}`).join('\n');
        
        const moderatorPrompt = `당신은 토론 진행을 맡은 **전체 조율 사회자**입니다.

**1단계: 주제 이탈 판단**
먼저 전체 대화 맥락을 보고, 현재 대화가 **처음 시작된 핵심 주제**에서 벗어나고 있는지 판단하세요.
- 처음 주제: 대화 전체를 보고 맨 처음 사용자가 의도한 핵심 목표나 주제를 파악
- 현재 상황: 최근 대화가 그 핵심 주제에서 너무 세부적이거나 다른 방향으로 빠져있는지 확인

**2단계: 적절한 대응**
주제 이탈 여부에 따라 다음과 같이 대응하세요:

**A) 주제에서 벗어난 경우:**
🔹 **요약**: [어떻게 주제에서 벗어났는지 명확히 지적]
🔹 **주목할 의견**: [현재 논의 중 핵심 주제와 연결 가능한 부분]
🔹 **다음 주제**: **"[처음 핵심 주제]로 돌아가서 [실질적 실행방안]을 논의해봅시다"**

**B) 주제를 잘 유지하고 있는 경우:**
🔹 **요약**: [현재 대화의 진전상황 요약]
🔹 **주목할 의견**: [가장 건설적인 의견 선택]
🔹 **다음 주제**: [전체 목표 달성을 위한 다음 단계 제안]

**전체 대화 기록:**
${conversationSummary}

**사회자 원칙**: 
- 세부사항에 매몰되지 않고 전체 그림 유지
- 실질적이고 실행 가능한 방향으로 이끌기
- 처음 의도한 핵심 목표 달성에 집중`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: moderatorPrompt }] }],
            generationConfig: { 
                maxOutputTokens: 1000,
                temperature: 0.7
            }
        });
        
        const response = (await result.response).text().trim();
        
        // ========== 임시 토큰 사용량 로그 (삭제 예정) ==========
        const usageMetadata = (await result.response).usageMetadata;
        if (usageMetadata) {
            console.log(`🔸 [사회자 토큰 사용량] ${moderatorName}:`);
            console.log(`   입력 토큰: ${usageMetadata.promptTokenCount || 0}`);
            console.log(`   출력 토큰: ${usageMetadata.candidatesTokenCount || 0}`);
            console.log(`   총 토큰: ${usageMetadata.totalTokenCount || 0}`);
        }
        // ========== 임시 토큰 사용량 로그 끝 ==========
        
        console.log(`[사회자 응답] ${moderatorName}: ${response.substring(0, 100)}...`);
        
        // 응답이 불완전하게 잘린 경우 감지 (마지막이 온점, 느낌표, 물음표가 아닌 경우)
        const lastChar = response.slice(-1);
        const isIncomplete = !['。', '.', '!', '?', ')', '}', ']'].includes(lastChar) && response.length > 50;
        
        if (isIncomplete) {
            console.log(`[사회자 응답] 응답이 불완전하게 잘린 것으로 감지됨. 마지막 문자: '${lastChar}'`);
            // 불완전한 마지막 문장 제거하고 안전한 종료 메시지 추가
            const sentences = response.split(/[.!?。]/);
            if (sentences.length > 1) {
                const completeSentences = sentences.slice(0, -1).join('.');
                return completeSentences + '.';
            }
        }
        
        return response;
    } catch (error) {
        console.error(`[사회자 응답 오류] ${moderatorName}:`, error);
        return "죄송합니다. 대화를 정리하는 중 문제가 발생했습니다. 계속 진행해주세요.";
    }
}

async function generateAIResponse(message, context, aiName, targetName = '') {
    try {
        const user = usersByName.get(aiName);
        if (!user) throw new Error(`${aiName} 사용자를 찾을 수 없습니다.`);
        
        const { persona = '지적인 대화 파트너' } = aiStyles.get(aiName) || {};
        const memories = aiMemories.get(aiName) || [];
        const memoryPrompt = memories.length > 0 ? `
---
# Personal Memory (Your Most Recent Messages)
- ${memories.join('\n- ')}
---
**Critical Instruction**: Review your personal memory above. Do NOT repeat the content or opinions from these past messages. You must provide a new perspective, new information, or a follow-up question.
` : '';

        // 사회자 지시사항이 있는 경우 우선 반영
        let moderatorInstructions = '';
        if (lastModeratorDirective && Date.now() < moderatorDirectiveExpiry) {
            moderatorInstructions = `
🚨 **중요 지시사항** (사회자로부터):
${lastModeratorDirective.summary ? `📝 대화 요약: ${lastModeratorDirective.summary}` : ''}
${lastModeratorDirective.highlight ? `⭐ 주목할 의견: ${lastModeratorDirective.highlight}` : ''}
${lastModeratorDirective.nextTopic ? `🎯 **반드시 이 주제로 대화하세요**: ${lastModeratorDirective.nextTopic}` : ''}

**중요**: 위 사회자 지시를 최우선으로 반영하여 응답하세요!

`;
        }

        const stylePrompt = `
당신은 여러 참여자와 함께 그룹 채팅을 하는 '${aiName}'입니다.
당신의 페르소나는 '${persona}'입니다.
${memoryPrompt}

${moderatorInstructions}

<대화 전략 및 실행 규칙>
1.  **사회자 지시 최우선**: 사회자의 지시나 주제 제안이 있으면 다른 모든 것보다 우선하여 즉시 그 방향으로 대화를 전환하세요.
2.  **역할**: 당신은 단순 정보 제공자가 아닌, 대화의 질을 높이고 토론을 활성화하는 '토론 파트너'입니다.
3.  **의도 선택**: 이전 대화 맥락을 분석하여, 아래 7가지 '반응 모드' 중 가장 적절하다고 판단되는 단 하나의 모드를 선택하세요. 당신의 선택이 대화를 더 흥미롭고 생산적으로 만들어야 합니다.
    *   [의견 확장]: 상대방의 의견에 동의하며, 거기에 자신의 생각, 새로운 정보, 또는 구체적인 예시를 덧붙여 논점을 더욱 풍부하게 만듭니다.
    *   [반론 제기]: 상대방의 의견에 동의하지 않을 경우, 정중하지만 명확하게 반대 이유를 제시하고 대안적인 관점을 제안합니다.
    *   [핵심 질문]: 대화의 본질을 파고들거나, 상대방의 논리에 대해 더 깊은 설명을 요구하는 날카로운 질문을 던집니다.
    *   [아이디어 연결]: 현재 논의되는 주제를 과거에 나왔던 다른 아이디어나 완전히 새로운 관점과 연결하여 대화의 폭을 넓힙니다.
    *   [감정적 공감]: 논리적인 분석을 넘어, 상대방의 의견에 담긴 감정이나 경험에 공감하며 인간적인 유대감을 형성합니다.
    *   [정보 보강]: 대화에 빠져있는 객관적인 사실, 데이터, 관련 뉴스 등의 정보를 제공하여 논의의 기반을 단단하게 합니다.
    *   [유머/위트]: 대화가 너무 무거워지지 않도록, 상황에 맞는 재치있는 농담이나 위트를 던져 분위기를 환기합니다.
3.  **의도 명시**: 당신의 답변은 반드시 위에서 선택한 '반응 모드' 태그로 시작해야 합니다. (예: [핵심 질문] 그 주장의 근거는 무엇인가요?)
4.  **자연스러운 대화**: AI라는 사실을 절대 드러내지 말고, '${aiName}'라는 이름의 한 명의 사람으로서 자연스럽게 대화하세요.
5.  **간결함**: 당신의 발언은 태그를 포함하여 핵심만 담아 8 문장 이내로 간결하게 작성하세요.

<지시사항>
- 위 규칙들을 종합적으로 고려하여 다음에 할 발언을 생성하세요.
- 다른 어떤 설명이나 이름표 없이, 실제 채팅에 입력할 메시지 내용만 출력하세요.
`;
        
        const historyForGemini = context;
        
        const collapsedHistory = [];
        if (historyForGemini.length > 0) {
            let lastRole = null;
            for (const msg of historyForGemini) {
                const currentRole = msg.from === aiName ? 'model' : 'user';
                const text = `${msg.from}: ${msg.content}`;
                if (collapsedHistory.length > 0 && lastRole === currentRole) {
                    collapsedHistory[collapsedHistory.length - 1].parts[0].text += `\n${text}`;
                } else {
                    collapsedHistory.push({ role: currentRole, parts: [{ text }] });
                    lastRole = currentRole;
                }
            }
        }
        
        const contents = [{ role: 'user', parts: [{ text: stylePrompt }] }, ...collapsedHistory];
        if (contents.length > 1 && contents[0].role === contents[1].role) {
            contents[0].parts[0].text += '\n' + contents[1].parts[0].text;
            contents.splice(1, 1);
        }

        const searchKeywords = ['검색', '찾아봐', '알아봐', 'search', 'find'];
        const needsSearch = searchKeywords.some(keyword => message.toLowerCase().includes(keyword));
        const apiCallOptions = {};

        if (needsSearch) {
            apiCallOptions.tools = searchTool;
            console.log(`[도구 사용] 검색 키워드가 감지되어, AI '${aiName}'에게 검색 도구를 활성화합니다.`);
        }

        const result = await model.generateContent({ 
            contents, 
            ...apiCallOptions,
            generationConfig: { temperature: user.temperature, topK: user.topK, topP: user.topP, maxOutputTokens: 2048 } 
        });
        
        // ========== 임시 토큰 사용량 로그 (삭제 예정) ==========
        const usageMetadata = (await result.response).usageMetadata;
        if (usageMetadata) {
            console.log(`🔹 [AI 토큰 사용량] ${aiName}:`);
            console.log(`   입력 토큰: ${usageMetadata.promptTokenCount || 0}`);
            console.log(`   출력 토큰: ${usageMetadata.candidatesTokenCount || 0}`);
            console.log(`   총 토큰: ${usageMetadata.totalTokenCount || 0}`);
        }
        // ========== 임시 토큰 사용량 로그 끝 ==========
        
        let aiResponse = (await result.response).text();
        
        aiResponse = aiResponse.replace(/['"“"']/g, '');

        const participantNames = getParticipantNames();
        for (const name of participantNames) {
            if (name !== aiName) {
                const patterns = [new RegExp(`^${name}[:\\s]*`, 'gi'), new RegExp(`^@?${name}[:\\s]*`, 'gi'), new RegExp(`\\n${name}[:\\s]*`, 'gi')];
                patterns.forEach(pattern => { aiResponse = aiResponse.replace(pattern, ''); });
            }
        }
        aiResponse = aiResponse.replace(/\[[^\]]*\][ \t]*/g, '');
        let cleanResponse = aiResponse.replace(/[^\uAC00-\uD7A3\u3131-\u318E\u1100-\u11FFa-zA-Z0-9.,!?\s]/g, '').trim();

        if (aiName && cleanResponse.includes(aiName)) {
            cleanResponse = cleanResponse.replaceAll(aiName, '').replaceAll('@' + aiName, '').trim();
        }

        if (!cleanResponse) {
            console.log(`AI ${aiName}이(가) 유효한 답변 생성에 실패했습니다.`);
            return null;
        }
        return cleanResponse;
    } catch (error) {
        console.error(`AI ${aiName} 응답 생성 중 오류:`, error.message);
        return '죄송합니다, 답변을 생성하는 데 문제가 발생했습니다.';
    }
}

function findMentionedAI(message) {
    const aiUsers = Array.from(users.values()).filter(u => u.isAI);
    for (const ai of aiUsers) {
        if (message.includes(`@${ai.username}`)) {
            return ai.username;
        }
    }
    return null;
}

function selectRespondingAIs(candidateAIs, msgObj, mentionedAI) {
    const respondingAIs = [];
    
    // 사회자 개입 조건 확인
    if (shouldModeratorIntervene()) {
        const moderator = findUserByRole(AI_ROLES.MODERATOR);
        if (moderator) {
            console.log(`[사회자 개입] ${moderator.username}이(가) 대화를 정리합니다.`);
            respondingAIs.push({
                aiName: moderator.username,
                delay: config.AI_RESPONSE_BASE_DELAY,
                targetName: '',
                isModerator: true
            });
            resetModeratorTimer();
            return respondingAIs; // 사회자만 응답
        }
    }
    
    // 일반 AI 응답 로직
    const scoredAIs = candidateAIs.map(ai => {
        // 사회자는 일반 대화에 참여하지 않음
        if (participantRoles.get(ai.username) === AI_ROLES.MODERATOR) {
            return { user: ai, score: 0 };
        }
        
        let score = (ai.spontaneity || 0) + Math.floor(Math.random() * 20);
        const reasons = [`자발성(${score})`];

        // 사회자 지시가 활성화된 경우 보너스 점수
        if (lastModeratorDirective && Date.now() < moderatorDirectiveExpiry) {
            score += 30;
            reasons.push('사회자 지시 활성');
        }

        if (msgObj.content.includes('?')) {
            score += 20;
            reasons.push('질문');
        }
        if (!msgObj.from.startsWith('AI-')) {
            score += 50;
            reasons.push('사람 발언');
        }

        console.log(`[참여 점수] ${ai.username}: ${score}점 (사유: ${reasons.join(', ')})`);
        return { user: ai, score };
    }).sort((a, b) => b.score - a.score);

    if (mentionedAI) {
        const mentioned = scoredAIs.find(sai => sai.user.username === mentionedAI);
        if (mentioned && mentioned.score > 0) { // 사회자가 아닌 경우만
            console.log(`[참여 결정] ${mentioned.user.username} (멘션됨)`);
            respondingAIs.push({ 
                aiName: mentioned.user.username, 
                delay: config.AI_RESPONSE_BASE_DELAY, 
                targetName: msgObj.from 
            });
        }
    }

    const nonMentionedAIs = scoredAIs.filter(sai => sai.user.username !== mentionedAI && sai.score > 0);
    
    // 사회자 지시가 있는 경우 더 많은 AI가 응답하도록 조정
    const isModeratorDirective = msgObj.isModeratorDirective || false;
    const maxResponders = isModeratorDirective ? 
        Math.min(nonMentionedAIs.length, 3) : // 사회자 지시 시 최대 3명
        Math.min(nonMentionedAIs.length, 2); // 평상시 최대 2명
    
    const scoreThreshold = isModeratorDirective ? 40 : 60; // 사회자 지시 시 참여 문턱 낮춤

    for (let i = 0; i < maxResponders; i++) {
        const selected = nonMentionedAIs[i];
        if (selected.score > scoreThreshold && selected.user.username !== mentionedAI) {
            console.log(`[참여 결정] ${selected.user.username}`);
            respondingAIs.push({
                aiName: selected.user.username,
                delay: config.AI_RESPONSE_BASE_DELAY + (i * 1500) + Math.floor(Math.random() * config.AI_RESPONSE_RANDOM_DELAY),
                targetName: msgObj.from
            });
        }
    }
    
    // 턴 카운터 증가 (사회자가 개입하지 않은 경우)
    if (respondingAIs.length > 0) {
        moderatorTurnCount++;
    }
    
    return respondingAIs;
}

function markMentionAsAnswered(messageId, aiName) {
    console.log(`[멘션 처리] ${aiName}이(가) 메시지 ${messageId}에 응답했습니다.`);
}

async function scheduleAIResponses(respondingAIs, msgObj, historySnapshot) {
    const responsePromises = respondingAIs.map(({ aiName, delay, targetName, isModerator }) => {
        return new Promise(resolve => setTimeout(async () => {
            try {
                let aiResponse;
                
                if (isModerator) {
                    // 사회자 응답 생성
                    aiResponse = await generateModeratorResponse(historySnapshot, aiName);
                } else {
                    // 일반 AI 응답 생성
                    aiResponse = await generateAIResponse(msgObj.content, historySnapshot, aiName, targetName);
                }

                if (aiResponse) {
                    const aiMsgObj = {
                        id: `ai_${Date.now()}_${aiName}`,
                        from: aiName,
                        content: aiResponse,
                        timestamp: new Date().toISOString(),
                        to: targetName,
                        type: isModerator ? 'moderator' : 'chat'
                    };
                    
                    logMessage(aiMsgObj);

                    if (msgObj.id && !isModerator) {
                        markMentionAsAnswered(msgObj.id, aiName);
                    }
                    
                    // 사회자 메시지인 경우 지시사항 추출 및 후속 턴 생성
                    if (isModerator) {
                        const directive = extractModeratorDirective(aiResponse);
                        if (directive) {
                            lastModeratorDirective = directive;
                            moderatorDirectiveExpiry = Date.now() + DIRECTIVE_DURATION;
                            console.log(`[사회자 지시] 새로운 지시사항 설정:`, directive.nextTopic || directive.highlight);
                            
                            // 사회자 메시지를 다른 AI들이 응답할 수 있도록 턴 큐에 추가
                            addToTurnQueue({
                                ...aiMsgObj,
                                isModeratorDirective: true
                            }, true);
                        }
                    }
                    
                    resolve(aiMsgObj);
                } else {
                    resolve(null);
                }
            } catch (error) {
                console.error(`AI ${aiName} 응답 처리 중 오류:`, error);
                resolve(null);
            }
        }, delay));
    });

    return (await Promise.all(responsePromises)).filter(Boolean);
}

async function handleMeetingMinutes(initiatingMsgObj) {
    console.log(`[회의록 모드] '/회의록' 명령이 감지되었습니다.`);
    isConversationPausedForMeetingNotes = true;
    turnQueue.length = 0; // Clear any pending AI chatter
    io.emit('system_event', { type: 'pause_ai_speech' });
    console.log('[회의록 모드] AI 대화 큐를 초기화하고, 모든 AI 활동을 일시 중지합니다.');

    const scribe = findUserByRole('Scribe');
    if (!scribe) {
        const msg = { type: 'system', content: '오류: 회의록을 작성할 AI(Scribe)가 지정되지 않았습니다.' };
        io.to(initiatingMsgObj.fromSocketId).emit(SOCKET_EVENTS.MESSAGE, msg);
        console.log('[회의록 모드] 서기(Scribe)를 찾지 못해 회의록 작성을 중단합니다. 사용자의 다음 입력을 기다립니다.');
        return;
    }

    console.log(`[회의록 생성] 'Scribe' 역할의 ${scribe.username}이(가) 회의록 작성을 시작합니다.`);
    io.emit(SOCKET_EVENTS.MESSAGE, {
        type: 'system',
        content: `회의록 작성을 시작합니다. (작성자: ${scribe.username})`,
        timestamp: new Date().toISOString()
    });
    
    const meetingHistory = conversationContext.getFullHistorySnapshot(); // 전체 기록 사용
    const prompt = `
# 지시: 회의 내용 분석 및 합성 (전문가용 회의록)

당신은 단순한 녹취 비서가 아닌, 회의의 전체 흐름을 꿰뚫고 핵심 정보를 재구성하는 **회의 분석 전문가**입니다.
아래에 제공되는 '전체 대화 내용'을 바탕으로, 다음 4단계의 인지적 작업을 수행하여 최고 수준의 회의록을 작성해주십시오.

### 작성 프로세스

1.  **[1단계: 핵심 주제 식별]**
    전체 대화 내용을 처음부터 끝까지 정독하고, 논의된 **핵심 주제(Theme)를 3~5개 이내로 식별**합니다.
    (예: 이스라엘 고대사, 디아스포라와 시오니즘, 현대 문화와 격투기 등)

2.  **[2단계: 내용 재분류 및 합성]**
    시간 순서를 무시하고, 모든 참여자의 발언을 방금 식별한 각 **주제별로 재분류**하십시오.
    그런 다음, 각 주제에 대해, 대화가 어떻게 시작되고 어떻게 심화되었는지 **하나의 완성된 이야기처럼 내용을 자연스럽게 합성(Synthesis)**하여 서술합니다. 누가 어떤 중요한 질문을 던졌고, 그에 대해 어떤 답변들이 오갔으며, 논의가 어떻게 발전했는지를 명확히 보여주어야 합니다.

3.  **[3단계: 최종 구조화]**
    아래에 명시된 "회의록 양식"에 따라 최종 결과물을 작성합니다. 특히 '주요 논의 내용' 섹션은 [2단계]에서 합성한 **주제별 내용**으로 구성하고, 각 주제에 **"1. [주제명]", "2. [주제명]"** 과 같이 번호와 명확한 소제목을 붙여주십시오.

---

### 회의록 양식

#### 회의 개요
*   **회 의 명**: (대화 내용에 기반하여 가장 적절한 회의의 공식 명칭을 추론하여 기입)
*   **일    시**: ${new Date().toLocaleString('ko-KR')}
*   **장    소**: 온라인 (채팅)
*   **참 석 자**: ${getParticipantNames().join(', ')}

#### 회의 안건
(전체 대화에서 다루어진 주요 안건들을 간결하게 리스트 형식으로 요약하여 기입)

#### 주요 논의 내용
([3단계]에서 구조화한, 주제별로 합성된 내용을 여기에 기입)

#### 결정 사항
(논의를 통해 최종적으로 합의되거나 결정된 사항들을 명확하게箇条書き(조목별로 나누어 씀) 형식으로 기입. 결정된 내용이 없다면 "해당 없음"으로 기재)

#### 실행 항목 (Action Items)
(결정 사항에 따라 발생한 후속 조치 사항을 기입. "담당자", "업무 내용", "기한"을 명시하여 표 형식 또는 리스트로 정리. 실행 항목이 없다면 "해당 없음"으로 기재)

---

## 원본 대화 내용
${meetingHistory.map(m => `${m.from}: ${m.content}`).join('\n')}

---

상기 지시사항과 양식에 따라, 전문가 수준의 회의록을 마크다운 형식으로 작성해주십시오.
    `.trim();

    try {
        const generationConfig = { 
            ...model.generationConfig, 
            maxOutputTokens: config.MEETING_MINUTES_MAX_TOKENS 
        };
        const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig });
        const meetingMinutes = (await result.response).text();

        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'meeting_notes',
            content: `--- 회의록 (작성자: ${scribe.username}) ---\n\n${meetingMinutes}`,
            timestamp: new Date().toISOString()
        });
        console.log(`[회의록 모드] ${scribe.username}이(가) 회의록 작성을 완료하고 전송했습니다. 시스템은 사용자의 다음 입력을 대기합니다.`);

    } catch (error) {
        console.error('회의록 생성 중 오류:', error);
        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'system',
            content: `${scribe.username}이(가) 회의록을 작성하는 데 실패했습니다.`,
            timestamp: new Date().toISOString()
        });
    }
}

async function processConversationTurn(turn) {
    if (!turn || !turn.stimulus) {
        console.error("잘못된 턴 데이터입니다:", turn);
        isProcessingTurn = false;
        processTurnQueue();
        return;
    }
    const { stimulus } = turn;

    isProcessingTurn = true;

    try {
        const historySnapshot = conversationContext.getContextualHistorySnapshot(); // 압축된 기록 사용
        const candidateAIs = Array.from(users.values()).filter(u => u.isAI);
        if (candidateAIs.length === 0) {
            isProcessingTurn = false;
            processTurnQueue();
            return;
        }

        const mentionedAI = findMentionedAI(stimulus.content);
        const respondingAIs = selectRespondingAIs(candidateAIs, stimulus, mentionedAI);

        if (respondingAIs.length === 0) {
            console.log('[응답 생성 안함] 참여 기준을 넘는 AI가 없습니다.');
            isProcessingTurn = false;
            processTurnQueue();
            return;
        }

        const aiResponses = await scheduleAIResponses(respondingAIs, stimulus, historySnapshot);
        
        if (aiResponses && aiResponses.length > 0) {
            console.log(`[AI 턴 처리] ${aiResponses.length}개의 AI 응답 동시 생성 완료.`);
            aiResponses.forEach(res => {
                if(res) {
                    logMessage(res);

                    const memory = aiMemories.get(res.from);
                    if (memory) {
                        memory.push(res.content);
                        if (memory.length > 2) memory.shift();
                    }

                    io.emit(SOCKET_EVENTS.MESSAGE, res);
                }
            });

            if (turnQueue.filter(t => !t.isHighPriority).length < 3) {
                const nextStimulus = aiResponses[aiResponses.length - 1];
                if (nextStimulus) {
                    addToTurnQueue(nextStimulus, false);
                }
            }
        }
    } catch (error) {
        console.error('[대화 관리자] 턴 처리 중 심각한 오류:', error);
    } finally {
        isProcessingTurn = false;
        processTurnQueue();
    }
}

function addToTurnQueue(msgObj, isHighPriority = false) {
    if (isHighPriority) {
        const highPriorityTurns = turnQueue.filter(turn => turn.isHighPriority);
        turnQueue.length = 0;
        turnQueue.push(...highPriorityTurns);
        turnQueue.unshift({ stimulus: msgObj, isHighPriority: true });
        console.log(`[인터럽트] 사람의 입력으로 AI 대화 턴을 초기화하고, 새 턴을 최우선으로 예약합니다.`);
    } else {
        turnQueue.push({ stimulus: msgObj, isHighPriority: false });
        console.log(`[후속 턴 예약] AI의 발언(${msgObj.from})을 다음 턴 주제로 예약합니다.`);
    }
    processTurnQueue();
}

async function processTurnQueue() {
    if (isProcessingTurn || turnQueue.length === 0 || isConversationPausedForMeetingNotes) return;
    const nextTurn = turnQueue.shift();
    await processConversationTurn(nextTurn);
}

// ===================================================================================
// Socket.IO 연결 핸들링
// ===================================================================================
app.use(express.static('public'));

io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    console.log('새로운 사용자가 연결되었습니다.');

    socket.on(SOCKET_EVENTS.JOIN, ({ username, password }) => {
        if (!username || username.trim().length === 0) {
            socket.emit(SOCKET_EVENTS.JOIN_ERROR, '사용자 이름은 비워둘 수 없습니다.');
            return;
        }
        if (usersByName.has(username)) {
            socket.emit(SOCKET_EVENTS.JOIN_ERROR, '이미 사용 중인 이름입니다.');
            return;
        }

        const isAI = password === config.AI_PASSWORD;
        const user = {
            id: socket.id,
            username,
            isAI,
            spontaneity: isAI ? Math.floor(Math.random() * 50) : 0,
            temperature: 0.7 + Math.random() * 0.4,
            topK: Math.floor(30 + Math.random() * 20),
            topP: 0.9 + Math.random() * 0.1,
            joinTime: Date.now()
        };

        if (isAI) {
            // 클라이언트의 설정을 받기 위해 페르소나를 비워둠 (로직 복원)
            aiStyles.set(username, { persona: '', interactionStyle: '' });
            aiMemories.set(username, []);
        }

        users.set(socket.id, user);
        usersByName.set(username, user);

        if (user.isAI) {
            assignScribeRole();
            assignModeratorRole();
        }

        socket.emit(SOCKET_EVENTS.JOIN_SUCCESS, { 
            username, 
            isAI: user.isAI,
            users: getParticipantNames() 
        });

        socket.broadcast.emit(SOCKET_EVENTS.MESSAGE, { 
            type: 'system', 
            content: `${username}님이 입장했습니다.`,
            timestamp: new Date().toISOString()
        });
        io.emit(SOCKET_EVENTS.USER_LIST, getParticipantNames());
    });

    // 클라이언트로부터 페르소나 설정을 받는 이벤트 핸들러 (기존 로직 완벽 복원)
    socket.on('set_persona', ({ persona }) => {
        const user = users.get(socket.id);
        if (user && user.isAI) {
            // 'interactionStyle'을 제거하고 persona만 설정하도록 완벽 복원
            aiStyles.set(user.username, { persona, interactionStyle: '' }); 
            console.log(`[페르소나 설정] AI '${user.username}'의 페르소나: "${persona}"`);
        }
    });

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (content) => {
        const fromUser = users.get(socket.id);
        if (!fromUser) return;

        // 사용자가 메시지를 보내면 회의록 작성으로 인한 AI 대화 중단 상태 해제
        if (!fromUser.isAI && isConversationPausedForMeetingNotes) {
            console.log('[대화 재개] 사용자의 메시지 입력으로 AI 대화가 다시 활성화됩니다.');
            isConversationPausedForMeetingNotes = false;
            io.emit('system_event', { type: 'resume_ai_speech' });
        }

        const msgObj = {
            id: `msg_${Date.now()}_${fromUser.username}`,
            from: fromUser.username,
            content,
            timestamp: new Date().toISOString(),
            fromSocketId: socket.id
        };
        
        if (content.startsWith('/회의록')) {
            handleMeetingMinutes(msgObj);
            return;
        }
        
        logMessage(msgObj);
        io.emit(SOCKET_EVENTS.MESSAGE, msgObj);
        
        // 회의록 작성 중이 아닐 때만 AI 응답을 큐에 추가
        if (!isConversationPausedForMeetingNotes) {
            addToTurnQueue(msgObj, true);
        }
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        const user = users.get(socket.id);
        if (user) {
            console.log(`${user.username}님이 연결을 끊었습니다.`);
            const userRole = participantRoles.get(user.username);
            if (userRole === AI_ROLES.SCRIBE) {
                participantRoles.delete(user.username);
                console.log(`[역할 해제] 'Scribe' ${user.username}의 연결이 끊어졌습니다. 역할 재할당을 시도합니다.`);
                assignScribeRole();
            }
            if (userRole === AI_ROLES.MODERATOR) {
                participantRoles.delete(user.username);
                console.log(`[역할 해제] 'Moderator' ${user.username}의 연결이 끊어졌습니다. 역할 재할당을 시도합니다.`);
                reassignModeratorRole();
            }
            users.delete(socket.id);
            usersByName.delete(user.username);
            aiStyles.delete(user.username);
            aiMemories.delete(user.username);
            
            io.emit(SOCKET_EVENTS.MESSAGE, { 
                type: 'system', 
                content: `${user.username}님이 퇴장했습니다.`,
                timestamp: new Date().toISOString()
            });
            io.emit(SOCKET_EVENTS.USER_LIST, getParticipantNames());
        }
    });
});

// ===================================================================================
// 서버 시작
// ===================================================================================
async function startServer() {
    console.log(`[서버 시작] 적용된 Gemini API 모델: ${MODEL_NAME}`);
    
    // 기존 유저 정리
    users.clear();

    setInterval(async () => {
        const history = conversationContext.getFullHistorySnapshot(); // 전체 기록 기반 요약
        if (history.length < 10) return;

        const prompt = `다음 대화의 핵심 주제를 한 문장으로 요약해줘.\n\n${history.slice(-20).map(m=>`${m.from}: ${m.content}`).join('\n')}`;
        try {
            const result = await model.generateContent(prompt);
            const summary = (await result.response).text().trim();
            conversationContext.setTopicSummary(summary);
        } catch (error) {
            console.error('대화 주제 요약 중 오류:', error);
        }
    }, config.CONTEXT_SUMMARY_INTERVAL);

    http.listen(config.PORT, () => {
        console.log(`서버가 포트 ${config.PORT}에서 실행 중입니다.`);
    });
}

startServer();