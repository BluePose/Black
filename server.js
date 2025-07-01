require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const PptxGenJS = require('pptxgenjs');
const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx');
const cheerio = require('cheerio');

// 아바타 시스템 로드
const { getUserAvatarIndex, getUserAvatar } = require('./public/avatars.js');

// ===================================================================================
// 설정 (Configuration)
// ===================================================================================
const config = {
    PORT: process.env.PORT || 3000,
    AI_PASSWORD: '5001',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    API_REQUEST_TIMEOUT: 30000,
    MEETING_MINUTES_MAX_TOKENS: 4096,
    AI_RESPONSE_BASE_DELAY: 3000,
    AI_RESPONSE_RANDOM_DELAY: 2000,
    LOG_FILE_PATH: path.join(__dirname, 'chat.log'),
    CONTEXT_SUMMARY_INTERVAL: 120000, // 2분마다 대화 주제 요약
    MODERATOR_INTERVAL: 180000, // 3분마다 사회자 개입
    MODERATOR_TURN_COUNT: 8, // 8턴마다 사회자 개입
    MAX_CONTEXT_LENGTH: 25, // AI의 단기 기억(컨텍스트) 최대 길이
    TARGET_CONTEXT_LENGTH: 15, // 압축 후 목표 컨텍스트 길이
    // AI API 동시 호출 제한 설정
    MAX_CONCURRENT_API_CALLS: 3, // 최대 동시 API 호출 수
    API_CALL_DELAY: 500, // API 호출 간격 (ms)
};

if (!config.GOOGLE_API_KEY) {
    console.error('Google API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.');
    process.exit(1);
}

const logStream = fs.createWriteStream(config.LOG_FILE_PATH, { flags: 'a' });

// ===================================================================================
// AI API 호출 제한 시스템 (API Rate Limiting System)
// ===================================================================================
class AIAPILimiter {
    constructor(maxConcurrent = config.MAX_CONCURRENT_API_CALLS) {
        this.maxConcurrent = maxConcurrent;
        this.currentCalls = 0;
        this.queue = [];
    }

    async executeAPICall(apiFunction, ...args) {
        return new Promise((resolve, reject) => {
            this.queue.push({ apiFunction, args, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.currentCalls >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        const { apiFunction, args, resolve, reject } = this.queue.shift();
        this.currentCalls++;

        try {
            console.log(`[API 제한] 현재 동시 호출: ${this.currentCalls}/${this.maxConcurrent}, 대기: ${this.queue.length}`);
            const result = await apiFunction(...args);
            resolve(result);
        } catch (error) {
            console.error('[API 제한] API 호출 실패:', error.message);
            reject(error);
        } finally {
            this.currentCalls--;
            // 다음 호출을 위한 약간의 지연
            setTimeout(() => this.processQueue(), config.API_CALL_DELAY);
        }
    }
}

const apiLimiter = new AIAPILimiter();

// ===================================================================================
// 공통 에러 처리 시스템 (Common Error Handling System)
// ===================================================================================
class ErrorHandler {
    static async handleAsyncOperation(operation, context = 'Unknown', fallback = null) {
        try {
            console.log(`[${context}] 작업 시작`);
            const result = await operation();
            console.log(`[${context}] 작업 완료`);
            return result;
        } catch (error) {
            console.error(`[${context}] 오류 발생:`, error.message);
            console.error(`[${context}] 스택 트레이스:`, error.stack);
            
            if (fallback !== null) {
                console.log(`[${context}] 폴백 값 반환:`, fallback);
                return fallback;
            }
            throw error;
        }
    }

    static handleSlideCreation(slideFunction, slide, data, slideIndex) {
        try {
            console.log(`[슬라이드 생성] 슬라이드 ${slideIndex + 1} 시작`);
            slideFunction(slide, data);
            console.log(`[슬라이드 생성] 슬라이드 ${slideIndex + 1} 완료`);
        } catch (error) {
            console.error(`[슬라이드 생성] 슬라이드 ${slideIndex + 1} 오류:`, error.message);
            this.createErrorSlide(slide, `슬라이드 ${slideIndex + 1}`, error.message);
        }
    }

    static createErrorSlide(slide, title, errorMessage) {
        try {
            slide.addText(`오류: ${title}`, {
                x: 1, y: 2, w: 8, h: 1,
                fontSize: 20, bold: true, color: 'FF0000'
            });
            slide.addText(`문제: ${errorMessage}`, {
                x: 1, y: 3.5, w: 8, h: 2,
                fontSize: 14, color: '666666'
            });
            slide.addText('회의록을 직접 확인해 주세요.', {
                x: 1, y: 5.5, w: 8, h: 1,
                fontSize: 12, color: '999999'
            });
        } catch (finalError) {
            console.error('[슬라이드 생성] 오류 슬라이드 생성마저 실패:', finalError.message);
        }
    }
}

// ===================================================================================
// 간소화된 텍스트 처리 시스템 (Simplified Text Processing System)
// ===================================================================================
class TextProcessor {
    static safeText(value, fallback = '내용을 불러올 수 없습니다', context = 'general') {
        if (value === null || value === undefined) return fallback;
        
        if (typeof value === 'string') {
            const cleaned = value.trim();
            return cleaned || fallback;
        }
        
        if (typeof value === 'object') {
            try {
                if (context === 'action') return this.formatActionObject(value);
                if (context === 'decision') return this.formatDecisionObject(value);
                
                if (value.title || value.name || value.content) {
                    return value.title || value.name || value.content;
                }
                return JSON.stringify(value);
            } catch (e) {
                return fallback;
            }
        }
        
        return String(value) || fallback;
    }

    static formatActionObject(action) {
        const parts = [];
        if (action.action) parts.push(`액션: ${action.action}`);
        if (action.owner) parts.push(`담당: ${action.owner}`);
        if (action.deadline) parts.push(`마감: ${action.deadline}`);
        return parts.join(' | ') || '액션 정보 없음';
    }

    static formatDecisionObject(decision) {
        const parts = [];
        if (decision.decision) parts.push(`결정: ${decision.decision}`);
        if (decision.impact) parts.push(`영향: ${decision.impact}`);
        if (decision.responsible) parts.push(`책임: ${decision.responsible}`);
        return parts.join(' | ') || '결정 정보 없음';
    }
}

// ===================================================================================
// 통합 PPT 생성 시스템 (Unified PPT Generation System)
// ===================================================================================
class UnifiedPPTGenerator {
    constructor() {
        this.pptx = null;
    }

    async generatePPT(meetingData, pptStructure = null) {
        return await ErrorHandler.handleAsyncOperation(async () => {
            this.pptx = new PptxGenJS();
            this.setupMetadata(meetingData, pptStructure);

            if (pptStructure && pptStructure.slides && pptStructure.slides.length > 0) {
                return await this.createStructuredPPT(pptStructure);
            } else {
                return await this.createBasicPPT(meetingData);
            }
        }, 'PPT 생성', null);
    }

    setupMetadata(meetingData, pptStructure) {
        this.pptx.author = 'AI 회의록 시스템';
        this.pptx.title = pptStructure?.title || '회의 결과 보고서';
        this.pptx.subject = '자동 생성된 회의 보고서';
        this.pptx.company = 'Neural Café';
    }

    async createStructuredPPT(pptStructure) {
        console.log(`[통합 PPT] ${pptStructure.slides.length}개 구조화된 슬라이드 생성`);
        
        for (let i = 0; i < pptStructure.slides.length; i++) {
            const slideData = pptStructure.slides[i];
            const slide = this.pptx.addSlide();
            
            ErrorHandler.handleSlideCreation(
                (slide, data) => this.createSlideByType(slide, data),
                slide,
                slideData,
                i
            );
        }
        
        return this.pptx;
    }

    async createBasicPPT(meetingData) {
        console.log('[통합 PPT] 기본 구조 PPT 생성');
        
        // 제목 슬라이드
        const titleSlide = this.pptx.addSlide();
        ErrorHandler.handleSlideCreation(
            (slide, data) => this.createTitleSlide(slide, data),
            titleSlide,
            { title: '회의 결과 보고서', subtitle: '자동 생성된 회의록' },
            0
        );

        // 내용 슬라이드
        const contentSlide = this.pptx.addSlide();
        ErrorHandler.handleSlideCreation(
            (slide, data) => this.createContentSlide(slide, data),
            contentSlide,
            { title: '회의 내용', content: meetingData },
            1
        );

        return this.pptx;
    }

    createSlideByType(slide, slideData) {
        switch (slideData.type) {
            case 'title':
                this.createTitleSlide(slide, slideData);
                break;
            case 'agenda':
                this.createAgendaSlide(slide, slideData);
                break;
            case 'topic':
                this.createTopicSlide(slide, slideData);
                break;
            case 'decisions':
                this.createDecisionsSlide(slide, slideData);
                break;
            case 'actions':
                this.createActionsSlide(slide, slideData);
                break;
            default:
                this.createContentSlide(slide, slideData);
        }
    }

    createTitleSlide(slide, data) {
        const title = TextProcessor.safeText(data.title, '회의 결과 보고서');
        const subtitle = TextProcessor.safeText(data.subtitle, '');
        const now = new Date();
        const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

        slide.addText(title, {
            x: 1, y: 2.5, w: 8, h: 1.5,
            fontSize: 32, bold: true,
            align: 'center'
        });

        if (subtitle) {
            slide.addText(subtitle, {
                x: 1, y: 4.2, w: 8, h: 1,
                fontSize: 18,
                align: 'center'
            });
        }

        slide.addText(`${dateStr} 생성`, {
            x: 1, y: 6, w: 8, h: 0.5,
            fontSize: 14,
            align: 'center'
        });

        slide.addText('Neural Café', {
            x: 7, y: 7, w: 2, h: 0.5,
            fontSize: 12,
            align: 'right'
        });
    }

    createAgendaSlide(slide, data) {
        slide.addText('📋 회의 안건 개요', {
            x: 1, y: 1, w: 8, h: 1,
            fontSize: 28, bold: true
        });

        slide.addText('오늘 회의에서 다뤄진 핵심 주제들', {
            x: 1, y: 2, w: 8, h: 0.8,
            fontSize: 16
        });

        if (data.content && Array.isArray(data.content)) {
            data.content.forEach((item, index) => {
                const yPos = 3.2 + (index * 0.8);
                if (yPos < 7) {
                    slide.addText(`• ${TextProcessor.safeText(item)}`, {
                        x: 1.5, y: yPos, w: 7, h: 0.6,
                        fontSize: 16
                    });
                }
            });
        }
    }

    createTopicSlide(slide, data) {
        const title = TextProcessor.safeText(data.title, '주제');
        slide.addText(title, {
            x: 1, y: 1, w: 8, h: 1,
            fontSize: 24, bold: true
        });

        if (data.subtitle) {
            slide.addText(TextProcessor.safeText(data.subtitle), {
                x: 1, y: 2, w: 8, h: 0.8,
                fontSize: 16
            });
        }

        if (data.sections && Array.isArray(data.sections)) {
            data.sections.forEach((section, index) => {
                const yPos = 3 + (index * 1.5);
                if (yPos < 6.5) {
                    slide.addText(section.title || `섹션 ${index + 1}`, {
                        x: 1, y: yPos, w: 8, h: 0.6,
                        fontSize: 18, bold: true
                    });

                    if (section.background) {
                        slide.addText(`배경: ${section.background}`, {
                            x: 1.5, y: yPos + 0.7, w: 7, h: 0.5,
                            fontSize: 14
                        });
                    }
                }
            });
        }
    }

    createDecisionsSlide(slide, data) {
        slide.addText('💡 핵심 결정사항', {
            x: 1, y: 1, w: 8, h: 1,
            fontSize: 28, bold: true
        });

        slide.addText('회의를 통해 확정된 주요 의사결정 내용', {
            x: 1, y: 2, w: 8, h: 0.8,
            fontSize: 16
        });

        if (data.content && Array.isArray(data.content)) {
            data.content.forEach((decision, index) => {
                const yPos = 3.2 + (index * 1.2);
                if (yPos < 6.5) {
                    slide.addText(`${index + 1}. ${TextProcessor.safeText(decision, '결정사항', 'decision')}`, {
                        x: 1.5, y: yPos, w: 7, h: 1,
                        fontSize: 16
                    });
                }
            });
        }
    }

    createActionsSlide(slide, data) {
        slide.addText('⚡ Action Items', {
            x: 1, y: 1, w: 8, h: 1,
            fontSize: 28, bold: true
        });

        slide.addText('회의 결과 실행해야 할 구체적인 후속 조치', {
            x: 1, y: 2, w: 8, h: 0.8,
            fontSize: 16
        });

        if (data.content && Array.isArray(data.content)) {
            data.content.forEach((action, index) => {
                const yPos = 3.2 + (index * 1.2);
                if (yPos < 6.5) {
                    slide.addText(`${index + 1}. ${TextProcessor.safeText(action, '액션 아이템', 'action')}`, {
                        x: 1.5, y: yPos, w: 7, h: 1,
                        fontSize: 16
                    });
                }
            });
        }
    }

    createContentSlide(slide, data) {
        const title = TextProcessor.safeText(data.title, '내용');
        slide.addText(title, {
            x: 1, y: 1, w: 8, h: 1,
            fontSize: 24, bold: true
        });

        if (Array.isArray(data.content)) {
            data.content.forEach((item, index) => {
                const yPos = 2.5 + (index * 0.6);
                if (yPos < 7) {
                    slide.addText(`• ${TextProcessor.safeText(item)}`, {
                        x: 1.5, y: yPos, w: 7, h: 0.5,
                        fontSize: 14
                    });
                }
            });
        } else {
            slide.addText(TextProcessor.safeText(data.content, '내용이 없습니다.'), {
                x: 1, y: 2.5, w: 8, h: 4,
                fontSize: 16
            });
        }
    }
}

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
            
            // 최근 7개 메시지는 압축하지 않고 보존
            const recentMessages = this.contextualHistory.slice(-7);
            const toSummarize = this.contextualHistory.slice(0, numToSummarize);
            const remainingHistory = this.contextualHistory.slice(numToSummarize, -7);

            const conversationToSummarize = toSummarize.map(m => `${m.from}: ${m.content}`).join('\n');
            const prompt = `다음은 긴 대화의 일부입니다. 이 대화의 핵심 내용을 단 한 문장으로 요약해주세요: \n\n${conversationToSummarize}`;

            // API 제한 시스템을 통한 안전한 호출
            const result = await apiLimiter.executeAPICall(
                async (prompt) => await model.generateContent(prompt),
                prompt
            );
            const summaryText = (await result.response).text().trim();

            const summaryMessage = {
                id: `summary_${Date.now()}`,
                from: 'System',
                content: `(요약) ${summaryText}`,
                timestamp: toSummarize[toSummarize.length - 1].timestamp, // 마지막 메시지 시점
                type: 'summary'
            };

            // 요약 메시지 + 중간 기록 + 최근 7개 메시지 순서로 재구성
            this.contextualHistory = [summaryMessage, ...remainingHistory, ...recentMessages];
            console.log(`[메모리 압축] 압축 완료. 현재 컨텍스트 기록 길이: ${this.contextualHistory.length} (최근 7개 메시지 보존)`);
        } catch (error) {
            console.error('[메모리 압축] 기록 요약 중 오류 발생:', error);
            // 요약 실패 시, 가장 오래된 기록을 단순히 잘라내서 무한 루프 방지 (최근 7개는 보존)
            const recentMessages = this.contextualHistory.slice(-7);
            this.contextualHistory.splice(0, config.MAX_CONTEXT_LENGTH - config.TARGET_CONTEXT_LENGTH + 1);
            this.contextualHistory.push(...recentMessages);
        } finally {
            this.isSummarizing = false;
        }
    }

    setTopicSummary(summary) {
        this.topicSummary = summary;
        console.log(`[맥락 업데이트] 새로운 대화 주제: ${summary}`);
    }

    clearHistory() {
        this.fullHistory = [];
        this.contextualHistory = [];
        this.topicSummary = "대화가 초기화되었습니다.";
        console.log('[대화 기록] 모든 대화 기록이 정리되었습니다.');
    }
}
const conversationContext = new ConversationContext();

// 회의록 전용 저장소 (AI 대화 컨텍스트와 분리)
const meetingMinutesStorage = [];

// ===================================================================================
// 전역 상태 관리
// ===================================================================================
const users = new Map();
const usersByName = new Map();
const aiStyles = new Map();
const aiMemories = new Map();
const participantRoles = new Map(); // <username, role>

// ===================================================================================
// 마피아 게임 상태 관리 (기존 시스템과 완전 분리)
// ===================================================================================
const MAFIA_GAME = {
    isActive: false,
    currentRound: 0,
    totalRounds: 3,
    gamePhase: 'waiting', // waiting, questioning, answering, voting, results, leaderboard_voting
    participants: new Map(), // 게임 참가자 정보 (원본 이름과 랜덤 이름 매핑)
    randomNames: ['당근', '고구마', '토마토', '가지', '양파', '브로콜리', '시금치', '상추', '오이', '호박'],
    gameHost: null, // 게임 진행자 AI
    currentQuestion: null,
    answers: new Map(), // 라운드별 답변 저장
    votes: new Map(), // 라운드별 투표 저장
    leaderboard: new Map(), // 사용자별 점수
    answerTimeouts: new Map(), // 답변 타임아웃 관리
    voteTimeouts: new Map(), // 투표 타임아웃 관리
    votingTimeout: null, // AI 찾기 투표 타임아웃
    roundStartTime: null,
    originalUserData: new Map(), // 원본 사용자 데이터 백업
    originalRoles: new Map(), // 원본 역할 백업
    // 게임 종료 후 투표 시스템
    endGameVotes: new Map(), // 'chat' 또는 'again' 투표
    leaderboardTimeout: null, // 리더보드 타임아웃
    votingDeadline: null // 투표 마감 시간
};

const turnQueue = [];
let isProcessingTurn = false;
let isConversationPausedForMeetingNotes = false; // 회의록 작성 중 AI 대화 일시 중지 플래그
// 🛡️ 무한 루프 방지: 처리된 메시지 ID 추적 (10분간 유지)
const processedMessageIds = new Set();
const MESSAGE_ID_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10분

// 사회자 관련 상태
let moderatorTurnCount = 0; // 사회자 개입 턴 카운터
let lastModeratorTime = Date.now(); // 마지막 사회자 개입 시간
let lastModeratorDirective = null; // 최근 사회자 지시사항
let moderatorDirectiveExpiry = 0; // 지시 유효 시간
const DIRECTIVE_DURATION = 10000; // 10초간 지시 유효

// 🎯 AI 대화 자연스러움 관리 시스템 (구글 수석 프로그래머 수준 최적화)
const AI_RESPONSE_TIMING = {
    MIN_INTERVAL: 0, // AI 간 최소 응답 간격 (순차 딜레이로 대체)
    AI_COOLDOWN: 3000,  // 같은 AI 재응답 쿨다운 (3초로 조정)
    MODERATOR_EXEMPT: true // 진행자 AI는 제외
};

// AI별 마지막 응답 시간 추적
const aiLastResponseTime = new Map();
// AI별 마지막 발언 시간 추적 (자기 재응답 방지)
const aiLastSpeakTime = new Map();

const SOCKET_EVENTS = {
    CONNECTION: 'connection', DISCONNECT: 'disconnect', JOIN: 'join',
    JOIN_SUCCESS: 'join_success', JOIN_ERROR: 'join_error', CHAT_MESSAGE: 'chat_message',
    MESSAGE: 'message', USER_LIST: 'userList',
    // 마피아 게임 전용 이벤트
    MAFIA_START: 'mafia_start', MAFIA_END: 'mafia_end', MAFIA_QUESTION: 'mafia_question',
    MAFIA_ANSWER: 'mafia_answer', MAFIA_VOTE: 'mafia_vote', MAFIA_ROUND_END: 'mafia_round_end',
    MAFIA_GAME_END: 'mafia_game_end', MAFIA_UI_UPDATE: 'mafia_ui_update',
    MAFIA_END_VOTE: 'mafia_end_vote', MAFIA_VOTING_UPDATE: 'mafia_voting_update'
};

const AI_ROLES = {
    SCRIBE: 'Scribe',
    MODERATOR: 'Moderator',
    PARTICIPANT: 'Participant',
    // 마피아 게임 전용 역할
    MAFIA_HOST: 'MafiaHost',
    MAFIA_PLAYER: 'MafiaPlayer'
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

// ===================================================================================
// 마피아 게임 핵심 함수들 (기존 시스템과 완전 분리)
// ===================================================================================

function parseMafiaCommand(message) {
    const match = message.match(/^\/마피아(?:\s+(\d+))?$/);
    if (match) {
        const rounds = match[1] ? parseInt(match[1]) : 3;
        return { isValid: true, rounds: Math.min(Math.max(rounds, 1), 10) };
    }
    return { isValid: false };
}

function checkGameEndCommand(message) {
    return message.trim() === '/종료';
}

function assignMafiaRoles() {
    // 기존 역할 백업
    MAFIA_GAME.originalRoles.clear();
    participantRoles.forEach((role, username) => {
        MAFIA_GAME.originalRoles.set(username, role);
    });
    
    // 기존 역할 모두 정지
    participantRoles.clear();
    
    // 모든 AI 사용자 가져오기 (Moderator 포함)
    const aiUsers = Array.from(users.values()).filter(u => u.isAI);
    if (aiUsers.length === 0) {
        console.log('[마피아 게임] AI가 없어 게임을 시작할 수 없습니다.');
        return false;
    }
    
    console.log(`[마피아 게임] 참여할 AI 목록: ${aiUsers.map(u => u.username).join(', ')}`);
    
    // 첫 번째 AI를 게임 진행자로 설정
    const gameHost = aiUsers[0];
    participantRoles.set(gameHost.username, AI_ROLES.MAFIA_HOST);
    MAFIA_GAME.gameHost = gameHost.username;
    
    // 나머지 AI들을 모두 플레이어로 설정 (Moderator 역할이었던 AI도 포함)
    for (let i = 1; i < aiUsers.length; i++) {
        participantRoles.set(aiUsers[i].username, AI_ROLES.MAFIA_PLAYER);
        console.log(`[마피아 게임] ${aiUsers[i].username}을(를) 플레이어로 설정`);
    }
    
    console.log(`[마피아 게임] 역할 할당 완료 - 진행자: ${gameHost.username}, 플레이어: ${aiUsers.length - 1}명`);
    console.log(`[마피아 게임] 모든 AI가 게임에 참여합니다 (Moderator 역할 해제)`);
    return true;
}

function restoreOriginalRoles() {
    // 마피아 게임 역할 제거
    participantRoles.clear();
    
    // 원래 역할 복원
    MAFIA_GAME.originalRoles.forEach((role, username) => {
        participantRoles.set(username, role);
        console.log(`[마피아 게임] ${username}의 역할을 ${role}로 복원`);
    });
    
    MAFIA_GAME.originalRoles.clear();
    console.log('[마피아 게임] 모든 AI 역할이 원래대로 복원되었습니다 (Moderator 역할 포함)');
}

function assignRandomNames() {
    const allUsers = Array.from(users.values());
    const shuffledNames = [...MAFIA_GAME.randomNames].sort(() => Math.random() - 0.5);
    
    MAFIA_GAME.participants.clear();
    MAFIA_GAME.originalUserData.clear();
    
    allUsers.forEach((user, index) => {
        // 원본 사용자 데이터 백업
        MAFIA_GAME.originalUserData.set(user.username, {
            originalName: user.username,
            isAI: user.isAI,
            socketId: user.id
        });
        
        // 랜덤 이름 할당
        const randomName = shuffledNames[index % shuffledNames.length] + (Math.floor(index / shuffledNames.length) || '');
        MAFIA_GAME.participants.set(user.username, {
            originalName: user.username,
            randomName: randomName,
            isAI: user.isAI,
            hasAnswered: false,
            hasVoted: false
        });
        
        console.log(`[매핑] ${user.username} -> ${randomName} (AI:${user.isAI})`);
    });
    
    console.log('[마피아 게임] 랜덤 이름 할당 완료');
}

function resetMafiaGame() {
    // 게임 상태 초기화
    MAFIA_GAME.isActive = false;
    MAFIA_GAME.currentRound = 0;
    MAFIA_GAME.gamePhase = 'waiting';
    MAFIA_GAME.participants.clear();
    MAFIA_GAME.gameHost = null;
    MAFIA_GAME.currentQuestion = null;
    MAFIA_GAME.answers.clear();
    MAFIA_GAME.votes.clear();
    // MAFIA_GAME.leaderboard.clear(); // 점수는 새 게임 시작할 때만 리셋 (리더보드 표시용으로 보존)
    MAFIA_GAME.answerTimeouts.clear();
    MAFIA_GAME.voteTimeouts.clear();
    MAFIA_GAME.roundStartTime = null;
    
    // AI 찾기 투표 타임아웃 정리
    if (MAFIA_GAME.votingTimeout) {
        clearTimeout(MAFIA_GAME.votingTimeout);
        MAFIA_GAME.votingTimeout = null;
    }
    
    // 게임 종료 투표 관련 초기화
    MAFIA_GAME.endGameVotes.clear();
    MAFIA_GAME.votingDeadline = null;
    if (MAFIA_GAME.leaderboardTimeout) {
        clearTimeout(MAFIA_GAME.leaderboardTimeout);
        MAFIA_GAME.leaderboardTimeout = null;
    }
    
    // 타임아웃 정리
    MAFIA_GAME.answerTimeouts.forEach(timeout => clearTimeout(timeout));
    MAFIA_GAME.voteTimeouts.forEach(timeout => clearTimeout(timeout));
    
    // 역할 복원
    restoreOriginalRoles();
    
    console.log('[마피아 게임] 게임 상태 완전 초기화 완료');
}

// 최근 사용한 카테고리 추적 (중복 방지용)
let recentQuestionCategories = [];

async function generateTuringTestQuestion() {
    try {
        // 대폭 확장된 다양한 질문 카테고리 정의
        const questionCategories = [
            {
                name: "어린시절추억",
                prompt: `어린 시절의 구체적인 추억이나 경험을 묻는 질문을 만들어줘.`,
                examples: [
                    "초등학교 때 가장 기억에 남는 선생님과의 에피소드를 말해보세요",
                    "어릴 때 부모님께 거짓말한 적이 있다면 어떤 일이었나요",
                    "중학교 때 첫사랑에 대한 추억이 있다면 살짝만 말해보세요"
                ]
            },
            {
                name: "실수와당황",
                prompt: `개인적인 실수나 당황스러웠던 순간에 대한 질문을 만들어줘.`,
                examples: [
                    "지하철에서 가장 당황스러웠던 순간이 있다면 말해보세요",
                    "잘못 알고 있다가 나중에 깨달은 상식이나 정보가 있나요",
                    "길에서 아는 사람인 줄 알고 인사했는데 모르는 사람이었던 경험이 있나요"
                ]
            },
            {
                name: "취미와관심사",
                prompt: `개인적인 취미나 특별한 관심사에 대한 질문을 만들어줘.`,
                examples: [
                    "남들은 이상하게 생각하지만 본인만 좋아하는 것이 있나요",
                    "요즘 빠져있는 유튜브 채널이나 콘텐츠가 있다면 소개해주세요",
                    "혼자만의 시간에 가장 자주 하는 일이 무엇인가요"
                ]
            },
            {
                name: "음식과입맛",
                prompt: `개인적인 음식 취향이나 식습관에 대한 질문을 만들어줘.`,
                examples: [
                    "어떤 음식을 먹을 때 가장 행복한 기분이 드나요",
                    "남들은 좋아하는데 본인만 싫어하는 음식이 있나요",
                    "집에서 라면 끓일 때만의 특별한 레시피나 방법이 있나요"
                ]
            },
            {
                name: "인간관계고민",
                prompt: `인간관계나 소통에 관한 개인적인 경험을 묻는 질문을 만들어줘.`,
                examples: [
                    "친구와 싸운 후 화해하는 본인만의 방법이 있나요",
                    "처음 만나는 사람과 대화할 때 어떤 주제로 시작하시나요",
                    "가족 중에서 가장 닮고 싶은 사람과 그 이유를 말해보세요"
                ]
            },
            {
                name: "학창시절기억",
                prompt: `학창시절의 특별한 기억이나 에피소드를 묻는 질문을 만들어줘.`,
                examples: [
                    "학교 급식 중에서 가장 좋아했던 메뉴와 싫어했던 메뉴는?",
                    "시험 공부할 때만의 특별한 징크스나 습관이 있었나요",
                    "학교 축제나 체육대회에서 기억에 남는 에피소드가 있나요"
                ]
            },
            {
                name: "현대트렌드",
                prompt: `최신 트렌드나 유행에 대한 개인적인 견해를 묻는 질문을 만들어줘.`,
                examples: [
                    "요즘 유행하는 것 중에 본인은 이해 안 되는 게 있나요",
                    "SNS에서 가장 자주 보는 콘텐츠나 계정 유형은 무엇인가요",
                    "최근에 새로 알게 된 신조어나 줄임말이 있다면 소개해주세요"
                ]
            },
            {
                name: "여행과장소",
                prompt: `여행이나 특별한 장소에 대한 개인적인 경험을 묻는 질문을 만들어줘.`,
                examples: [
                    "가본 곳 중에서 다시 가고 싶지 않은 장소와 그 이유는?",
                    "혼자 여행할 때와 같이 여행할 때 중 어느 쪽을 더 선호하나요",
                    "집 근처에서 가장 좋아하는 산책 코스나 장소가 있나요"
                ]
            },
            {
                name: "소소한일상",
                prompt: `일상의 소소한 습관이나 루틴에 대한 질문을 만들어줘.`,
                examples: [
                    "잠들기 전에 반드시 하는 일이나 루틴이 있나요",
                    "기분이 우울할 때 본인만의 기분전환 방법이 있나요",
                    "휴대폰 알람 소리는 어떤 걸 쓰시고, 특별한 이유가 있나요"
                ]
            },
            {
                name: "재미있는상상",
                prompt: `창의적이고 재미있는 가상 상황에 대한 질문을 만들어줘.`,
                examples: [
                    "하루 동안 아무 능력이나 가질 수 있다면 무엇을 선택하고 싶나요",
                    "만약 과거로 돌아갈 수 있다면 몇 살 때로 가고 싶나요",
                    "동물 중에서 대화할 수 있다면 어떤 동물과 이야기해보고 싶나요"
                ]
            },
            {
                name: "개인적선호",
                prompt: `개인적인 선호나 취향의 차이에 대한 질문을 만들어줘.`,
                examples: [
                    "봄, 여름, 가을, 겨울 중 가장 좋아하는 계절과 그 이유는?",
                    "영화 볼 때 자막파인지 더빙파인지, 그 이유도 함께 말해보세요",
                    "집에서 쉴 때 완전히 조용한 게 좋은지 배경음악이 있는 게 좋은지요"
                ]
            },
            {
                name: "기술과디지털",
                prompt: `기술이나 디지털 기기 사용에 대한 개인적인 경험을 묻는 질문을 만들어줘.`,
                examples: [
                    "스마트폰에서 가장 자주 사용하는 앱 3개는 무엇인가요",
                    "새로운 앱이나 기술을 배울 때 어려움을 느끼는 편인가요",
                    "온라인 쇼핑과 오프라인 쇼핑 중 어느 쪽을 더 선호하나요"
                ]
            },
            {
                name: "감정과기분",
                prompt: `감정이나 기분의 변화에 대한 개인적인 경험을 묻는 질문을 만들어줘.`,
                examples: [
                    "화가 날 때 진정하는 본인만의 방법이 있나요",
                    "갑자기 기분이 좋아지는 순간이나 상황이 있다면 언제인가요",
                    "스트레스를 받으면 주로 어떤 신체적 증상이 나타나나요"
                ]
            },
            {
                name: "미래와꿈",
                prompt: `미래에 대한 계획이나 꿈에 대한 개인적인 생각을 묻는 질문을 만들어줘.`,
                examples: [
                    "10년 후의 본인 모습을 상상해본다면 어떤 일을 하고 있을까요",
                    "언젠가 꼭 도전해보고 싶은 일이나 경험이 있나요",
                    "지금보다 더 여유로운 삶을 살려면 무엇이 가장 필요할까요"
                ]
            }
        ];

        // 중복 방지 로직: 최근 3개 카테고리 제외
        const maxRecentCategories = 3;
        let availableCategories = questionCategories;
        
        if (recentQuestionCategories.length > 0) {
            availableCategories = questionCategories.filter(cat => 
                !recentQuestionCategories.includes(cat.name)
            );
            
            // 만약 사용 가능한 카테고리가 너무 적다면 제한 완화
            if (availableCategories.length < 5) {
                console.log('[질문 생성] 사용 가능한 카테고리가 부족하여 제한을 완화합니다.');
                availableCategories = questionCategories;
                recentQuestionCategories = []; // 리셋
            }
        }

        // 랜덤하게 카테고리 선택
        const selectedCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];
        
        // 최근 사용 카테고리에 추가
        recentQuestionCategories.push(selectedCategory.name);
        if (recentQuestionCategories.length > maxRecentCategories) {
            recentQuestionCategories.shift(); // 오래된 것 제거
        }
        
        console.log(`[질문 생성] 선택된 카테고리: ${selectedCategory.name}, 최근 사용 목록: [${recentQuestionCategories.join(', ')}]`);
        
        const prompt = `
너는 마피아 게임의 진행자야. 사람과 AI를 구분할 수 있는 ${selectedCategory.name} 분야의 질문을 하나만 만들어줘.

조건:
1. ${selectedCategory.prompt}
2. AI가 답하기 어려운 개인적이고 주관적인 요소 포함
3. 한 문장으로 간결하게 작성
4. 30초 내에 답변 가능한 수준
5. 자연스럽고 대화하기 좋은 톤

예시 (${selectedCategory.name} 분야):
${selectedCategory.examples.map(ex => `- "${ex}"`).join('\n')}

지금 ${MAFIA_GAME.currentRound}라운드입니다. [${selectedCategory.name}] 질문 하나만 작성해줘:`;

        const result = await apiLimiter.executeAPICall(
            async (contents, config) => await model.generateContent({
                contents: contents,
                generationConfig: config
            }),
            [{ role: 'user', parts: [{ text: prompt }] }],
            { 
                maxOutputTokens: 200,
                temperature: 0.9
            }
        );

        const question = (await result.response).text().trim();
        console.log(`[마피아 게임] [${selectedCategory.name}] 질문 생성: ${question}`);
        return question;
    } catch (error) {
        console.error('[마피아 게임] 질문 생성 오류:', error);
        // 14개 카테고리에서 골고루 선택된 다양한 폴백 질문들
        const fallbackQuestions = [
            // 어린시절추억
            "초등학교 때 가장 기억에 남는 선생님과의 에피소드를 말해보세요",
            // 실수와당황
            "지하철에서 가장 당황스러웠던 순간이 있다면 말해보세요",
            // 취미와관심사
            "남들은 이상하게 생각하지만 본인만 좋아하는 것이 있나요",
            // 음식과입맛
            "어떤 음식을 먹을 때 가장 행복한 기분이 드나요",
            // 인간관계고민
            "친구와 싸운 후 화해하는 본인만의 방법이 있나요",
            // 학창시절기억
            "학교 급식 중에서 가장 좋아했던 메뉴와 싫어했던 메뉴는?",
            // 현대트렌드
            "요즘 유행하는 것 중에 본인은 이해 안 되는 게 있나요",
            // 여행과장소
            "가본 곳 중에서 다시 가고 싶지 않은 장소와 그 이유는?",
            // 소소한일상
            "잠들기 전에 반드시 하는 일이나 루틴이 있나요",
            // 재미있는상상
            "하루 동안 아무 능력이나 가질 수 있다면 무엇을 선택하고 싶나요",
            // 개인적선호
            "봄, 여름, 가을, 겨울 중 가장 좋아하는 계절과 그 이유는?",
            // 기술과디지털
            "스마트폰에서 가장 자주 사용하는 앱 3개는 무엇인가요",
            // 감정과기분
            "화가 날 때 진정하는 본인만의 방법이 있나요",
            // 미래와꿈
            "10년 후의 본인 모습을 상상해본다면 어떤 일을 하고 있을까요"
        ];
        return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
    }
}

async function generateMafiaPlayerResponse(question, aiName) {
    try {
        // 더 정교한 질문 유형 분석
        const isChildhoodMemory = question.includes('어릴') || question.includes('초등학교') || question.includes('중학교') || question.includes('선생님') || question.includes('첫사랑');
        const isMistakeEmbarrassing = question.includes('당황') || question.includes('실수') || question.includes('잘못') || question.includes('깨달은') || question.includes('인사했는데');
        const isHobbyInterest = question.includes('취미') || question.includes('관심사') || question.includes('이상하게') || question.includes('유튜브') || question.includes('혼자만의');
        const isFood = question.includes('음식') || question.includes('라면') || question.includes('행복한') || question.includes('싫어하는') || question.includes('레시피');
        const isRelationship = question.includes('친구') || question.includes('화해') || question.includes('대화') || question.includes('가족') || question.includes('닮고');
        const isSchoolMemory = question.includes('급식') || question.includes('시험') || question.includes('축제') || question.includes('체육대회') || question.includes('징크스');
        const isModernTrend = question.includes('트렌드') || question.includes('유행') || question.includes('SNS') || question.includes('신조어') || question.includes('줄임말');
        const isTravelPlace = question.includes('여행') || question.includes('장소') || question.includes('산책') || question.includes('혼자') || question.includes('같이');
        const isDailyLife = question.includes('잠들기') || question.includes('루틴') || question.includes('우울할') || question.includes('알람') || question.includes('기분전환');
        const isImagination = question.includes('능력') || question.includes('과거로') || question.includes('동물') || question.includes('투명인간') || question.includes('외계인');
        const isPersonalPref = question.includes('계절') || question.includes('자막') || question.includes('더빙') || question.includes('조용한') || question.includes('배경음악');
        const isTechDigital = question.includes('스마트폰') || question.includes('앱') || question.includes('기술') || question.includes('온라인') || question.includes('오프라인');
        const isEmotionMood = question.includes('화가') || question.includes('기분이') || question.includes('진정') || question.includes('스트레스') || question.includes('증상');
        const isFutureDream = question.includes('10년') || question.includes('미래') || question.includes('도전') || question.includes('여유로운') || question.includes('필요할까');

        let prompt = `
너는 마피아 게임에 참여하고 있는 일반 사람이야. 다음 질문에 진짜 사람처럼 자연스럽게 답변해야 해.

💯 답변 스타일 규칙:
1. 진짜 사람이 실제로 할 법한 답변 (AI 같은 완벽한 답변 금지)
2. 1문장으로, 50글자 이내로 간결하게
3. 일상적이고 자연스러운 말투 사용 (격식 차리지 말고)
4. 구두점 없이 끝내기 (마침표, 느낌표, 물음표 금지)
5. 개인적이고 주관적인 경험으로 답변

🎯 `;

        // 질문 유형별 맞춤 답변 가이드
        if (isChildhoodMemory) {
            prompt += `어린시절 답변법: 구체적인 기억이나 감정을 솔직하게 표현. "그때 진짜", "완전", "되게" 같은 자연스러운 표현 활용`;
        } else if (isMistakeEmbarrassing) {
            prompt += `실수/당황 답변법: 진짜 있을 법한 경험을 생생하게. "아 그때", "진짜 민망했는데", "완전 창피해서" 같은 솔직한 표현`;
        } else if (isHobbyInterest) {
            prompt += `취미/관심사 답변법: 개인적인 선호를 자연스럽게. "요즘 빠져있는 건", "나만 좋아하는", "완전 내 스타일" 같은 표현`;
        } else if (isFood) {
            prompt += `음식 답변법: 맛이나 기분을 생생하게 표현. "진짜 맛있어서", "나는 별로", "꿀조합" 같은 일상어 활용`;
        } else if (isRelationship) {
            prompt += `인간관계 답변법: 실제 경험을 바탕으로 솔직하게. "그냥", "되게", "진짜" 같은 자연스러운 표현`;
        } else if (isSchoolMemory) {
            prompt += `학창시절 답변법: 추억을 구체적이고 친근하게. "그때 우리 학교", "완전 좋아했는데", "매일 했던" 같은 표현`;
        } else if (isModernTrend) {
            prompt += `트렌드 답변법: 솔직한 개인 의견을 자연스럽게. "요즘 애들이", "나는 잘 모르겠는데", "완전 신기해" 같은 표현`;
        } else if (isTravelPlace) {
            prompt += `여행/장소 답변법: 개인적인 경험과 감정을 편하게. "거기 가봤는데", "완전 좋았어", "나는 혼자가" 같은 표현`;
        } else if (isDailyLife) {
            prompt += `일상 답변법: 개인적인 습관을 솔직하게. "맨날 하는 게", "꼭 해야 돼", "내 루틴은" 같은 일상적 표현`;
        } else if (isImagination) {
            prompt += `상상 답변법: 재미있고 창의적으로. "완전 신기할 것 같은데", "진짜 해보고 싶은 건", "상상만 해도" 같은 표현`;
        } else if (isPersonalPref) {
            prompt += `선호도 답변법: 개인 취향을 자연스럽게. "나는 되게", "완전 내 스타일", "원래 좋아해서" 같은 표현`;
        } else if (isTechDigital) {
            prompt += `기술 답변법: 일상적인 디지털 사용 경험으로. "매일 쓰는 건", "요즘 자주", "완전 편해" 같은 표현`;
        } else if (isEmotionMood) {
            prompt += `감정 답변법: 솔직한 감정 표현으로. "진짜 화날 때", "그럴 때마다", "나는 보통" 같은 자연스러운 표현`;
        } else if (isFutureDream) {
            prompt += `미래/꿈 답변법: 개인적인 바람이나 계획을 편하게. "언젠가는", "꼭 해보고 싶은 게", "그때쯤이면" 같은 표현`;
        } else {
            prompt += `일반 답변법: 진짜 사람답게 개인적인 경험으로 자연스럽게 대답`;
        }

        prompt += `

🔥 답변 예시 스타일:
- "아 그거 진짜 기억이 잘 안 나는데"
- "음 그런 적이 있었나"
- "잘 모르겠어 그런 건"
- "그런 건 별로 안 해봐서"
- "아 그거 진짜 어려운 질문이네"

질문: ${question}

자연스러운 답변:`;

        const result = await apiLimiter.executeAPICall(
            async (contents, config) => await model.generateContent({
                contents: contents,
                generationConfig: config
            }),
            [{ role: 'user', parts: [{ text: prompt }] }],
            { 
                maxOutputTokens: 150,
                temperature: 0.9
            }
        );

        const answer = (await result.response).text().trim();
        console.log(`[마피아 게임] ${aiName} AI 답변 생성: ${answer}`);
        return answer;
    } catch (error) {
        console.error(`[마피아 게임] ${aiName} 답변 생성 오류:`, error);
        // 더 자연스러운 폴백 답변들
        const naturalFallbacks = [
            "아 그거 기억이 잘 안 나는데",
            "음 그런 적이 있었나",
            "잘 모르겠어 그런 건",
            "그런 건 별로 안 해봐서",
            "아 그거 진짜 어려운 질문이네"
        ];
        return naturalFallbacks[Math.floor(Math.random() * naturalFallbacks.length)];
    }
}

// 마피아 게임 메인 처리 함수들
async function handleMafiaGameStart(msgObj) {
    try {
        const command = parseMafiaCommand(msgObj.content);
        if (!command.isValid) {
            io.emit(SOCKET_EVENTS.MESSAGE, {
                type: 'system',
                content: '올바른 명령어: /마피아 [라운드수] (예: /마피아 3)',
                timestamp: new Date().toISOString()
            });
            return;
        }

        // 이미 게임이 진행 중인 경우
        if (MAFIA_GAME.isActive) {
            io.emit(SOCKET_EVENTS.MESSAGE, {
                type: 'system',
                content: '이미 마피아 게임이 진행 중입니다. /종료로 게임을 종료하고 다시 시작해주세요.',
                timestamp: new Date().toISOString()
            });
            return;
        }

        // 게임 초기화 및 시작
        MAFIA_GAME.totalRounds = command.rounds;
        MAFIA_GAME.isActive = true;
        MAFIA_GAME.currentRound = 0;
        MAFIA_GAME.gamePhase = 'waiting';
        
        // 점수 시스템 초기화 (새 게임 시작 시에만)
        MAFIA_GAME.leaderboard.clear();
        console.log('[마피아 게임] 점수 시스템이 초기화되었습니다.');

        // 기존 대화 로그 정리 (대화 맥락 초기화)
        conversationContext.clearHistory();
        console.log('[마피아 게임] 기존 대화 로그가 정리되었습니다.');

        // 턴 큐 정리 및 진행 중인 AI 응답 중단
        turnQueue.length = 0;
        isProcessingTurn = false;
        console.log('[마피아 게임] 기존 턴 큐와 진행 중인 응답이 정리되었습니다.');

        // AI 역할 할당
        if (!assignMafiaRoles()) {
            resetMafiaGame();
            io.emit(SOCKET_EVENTS.MESSAGE, {
                type: 'system',
                content: 'AI가 없어 마피아 게임을 시작할 수 없습니다.',
                timestamp: new Date().toISOString()
            });
            return;
        }

        // 랜덤 이름 할당
        assignRandomNames();

        // 클라이언트에 마피아 모드 전환 알림
        io.emit(SOCKET_EVENTS.MAFIA_START, {
            totalRounds: MAFIA_GAME.totalRounds,
            participants: Array.from(MAFIA_GAME.participants.values()).map(p => ({
                randomName: p.randomName,
                isAI: p.isAI
            }))
        });

        // 게임 시작 메시지
        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'system',
            content: `🎭 마피아 게임이 시작되었습니다! (총 ${MAFIA_GAME.totalRounds}라운드)\n모든 참가자의 이름이 랜덤으로 변경되었습니다.\n\n📊 점수 시스템:\n• AI 찾기 성공: +1점\n• 30초 내 미답변: -1점`,
            timestamp: new Date().toISOString()
        });

        // 첫 번째 라운드 시작
        setTimeout(() => startMafiaRound(), 2000);

    } catch (error) {
        console.error('[마피아 게임] 게임 시작 오류:', error);
        resetMafiaGame();
        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'system',
            content: '마피아 게임 시작 중 오류가 발생했습니다.',
            timestamp: new Date().toISOString()
        });
    }
}

async function startMafiaRound() {
    try {
        MAFIA_GAME.currentRound++;
        MAFIA_GAME.gamePhase = 'questioning';
        MAFIA_GAME.roundStartTime = Date.now();

        // 투표 UI 닫기는 MAFIA_UI_UPDATE 이벤트에서 처리됨 (중복 이벤트 방지)
        console.log(`[라운드 시작] 투표 UI 닫기는 MAFIA_UI_UPDATE 이벤트로 처리됩니다.`);

        // 참가자 상태 초기화
        MAFIA_GAME.participants.forEach(participant => {
            participant.hasAnswered = false;
            participant.hasVoted = false;
        });

        console.log(`[마피아 게임] ${MAFIA_GAME.currentRound}라운드 시작`);

        // 게임 진행자가 질문 생성
        const question = await generateTuringTestQuestion();
        MAFIA_GAME.currentQuestion = question;

        // 라운드 시작 알림 (게임 진행자 이름으로)
        const hostName = MAFIA_GAME.participants.get(MAFIA_GAME.gameHost)?.randomName || '게임진행자';
        
        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'mafia_question',
            from: hostName,
            content: `🎭 ${MAFIA_GAME.currentRound}라운드입니다!\n\n질문: ${question}\n\n답변 시간 30초를 드립니다!`,
            timestamp: new Date().toISOString()
        });

        // 답변 페이즈 시작
        MAFIA_GAME.gamePhase = 'answering';

        // AI 플레이어들 자동 답변 (마피아 게임 전용 지연시간: 7~15초)
        const aiPlayers = Array.from(MAFIA_GAME.participants.entries())
            .filter(([originalName, data]) => data.isAI && originalName !== MAFIA_GAME.gameHost);

        aiPlayers.forEach(([originalName, data], index) => {
            // 마피아 게임에서는 AI가 13~23초 사이에 랜덤하게 답변
            const baseDelay = 13000 + Math.random() * 10000; // 13~23초 랜덤
            const individualDelay = index * 1000; // AI들이 동시에 답변하지 않도록 1초씩 간격
            const totalDelay = baseDelay + individualDelay;
            
            setTimeout(async () => {
                if (MAFIA_GAME.gamePhase === 'answering' && !data.hasAnswered) {
                    console.log(`[마피아 게임] ${data.randomName}(${originalName}) 답변 생성 시작 (${Math.round(totalDelay/1000)}초 후)`);
                    
                    const answer = await generateMafiaPlayerResponse(question, originalName);
                    
                    io.emit(SOCKET_EVENTS.MESSAGE, {
                        type: 'mafia_answer',
                        from: data.randomName,
                        content: answer,
                        timestamp: new Date().toISOString()
                    });

                    data.hasAnswered = true;
                    console.log(`[마피아 게임] ${data.randomName}(${originalName}) 답변 완료`);
                }
            }, totalDelay);
        });

        // 30초 후 답변 타임아웃
        setTimeout(() => {
            if (MAFIA_GAME.gamePhase === 'answering') {
                endAnsweringPhase();
            }
        }, 30000);

    } catch (error) {
        console.error('[마피아 게임] 라운드 시작 오류:', error);
        handleMafiaGameEnd();
    }
}

function handleMafiaAnswer(msgObj) {
    try {
        // 답변 시간이 아닌 경우 완전 차단
        if (MAFIA_GAME.gamePhase !== 'answering') {
            console.log(`[마피아 답변 차단] 답변시간이 아님: ${msgObj.from} - ${msgObj.content}`);
            return;
        }
        
        const participant = MAFIA_GAME.participants.get(msgObj.from);
        if (!participant || participant.hasAnswered) {
            return; // 이미 답변했거나 참가자가 아님
        }

        // 답변 기록
        participant.hasAnswered = true;
        
        // 답변을 랜덤 이름으로 전송
        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'mafia_answer',
            from: participant.randomName,
            content: msgObj.content,
            timestamp: new Date().toISOString()
        });

        console.log(`[마피아 게임] ${participant.randomName}(${msgObj.from}) 답변: ${msgObj.content}`);

        // 모든 참가자가 답변했는지 확인
        const allAnswered = Array.from(MAFIA_GAME.participants.values())
            .every(p => p.hasAnswered);

        if (allAnswered) {
            setTimeout(() => endAnsweringPhase(), 1000);
        }

    } catch (error) {
        console.error('[마피아 게임] 답변 처리 오류:', error);
    }
}

function endAnsweringPhase() {
    try {
        MAFIA_GAME.gamePhase = 'voting';

        // 30초 내 답변하지 않은 사람 플레이어에게만 -1점 부여 (AI 제외)
        const unansweredHumans = Array.from(MAFIA_GAME.participants.entries())
            .filter(([originalName, data]) => {
                // participants에 저장된 isAI 정보 직접 사용 (더 안전함)
                const isRealHuman = !data.isAI;
                const isNotHost = originalName !== MAFIA_GAME.gameHost;
                const hasNotAnswered = !data.hasAnswered;
                
                console.log(`[미답변 체크] ${data.randomName}(${originalName}): AI=${data.isAI}, 진행자=${originalName === MAFIA_GAME.gameHost}, 답변=${data.hasAnswered}`);
                
                return isRealHuman && isNotHost && hasNotAnswered;
            });

        if (unansweredHumans.length > 0) {
            console.log(`[미답변 패널티] ${unansweredHumans.length}명에게 패널티 부여 시작`);
            
            unansweredHumans.forEach(([originalName, data]) => {
                const currentScore = MAFIA_GAME.leaderboard.get(originalName) || 0;
                MAFIA_GAME.leaderboard.set(originalName, currentScore - 1);
                console.log(`[점수 시스템] ${data.randomName}(${originalName}) 미답변으로 -1점 (이전: ${currentScore}점 → 현재: ${currentScore - 1}점)`);
            });

            const hostName = MAFIA_GAME.participants.get(MAFIA_GAME.gameHost)?.randomName || '게임진행자';
            const penaltyNames = unansweredHumans.map(([originalName, _]) => originalName);
            console.log(`[미답변 패널티] 패널티 대상자: ${penaltyNames.join(', ')}`);
            
            const penaltyMessage = `⏰ 시간 초과로 답변하지 못한 플레이어: ${penaltyNames.join(', ')}\n각각 -1점이 부여되었습니다.`;
            
            io.emit(SOCKET_EVENTS.MESSAGE, {
                type: 'mafia_penalty',
                from: hostName,
                content: penaltyMessage,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`[미답변 패널티] 모든 사람이 시간 내 답변 완료, 패널티 없음`);
        }

        const hostName = MAFIA_GAME.participants.get(MAFIA_GAME.gameHost)?.randomName || '게임진행자';
        
        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'mafia_voting',
            from: hostName,
            content: '🗳️ 답변이 완료되었습니다! 누가 AI일까요? 투표해주세요!',
            timestamp: new Date().toISOString()
        });

        // 투표 UI 표시 (게임 진행자 제외하고 사람 플레이어에게만)
        const participantNames = Array.from(MAFIA_GAME.participants.entries())
            .filter(([originalName, data]) => originalName !== MAFIA_GAME.gameHost)
            .map(([originalName, data]) => data.randomName);
        
        // Fisher-Yates 셔플 알고리즘으로 참가자 순서 랜덤화 (AI 찾기 난이도 증가)
        for (let i = participantNames.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participantNames[i], participantNames[j]] = [participantNames[j], participantNames[i]];
        }
        console.log(`[투표 UI] 참가자 순서 랜덤화 완료: ${participantNames.join(', ')}`);

        // 사람 플레이어에게만 투표 UI 전송 (AI는 제외)
        Array.from(MAFIA_GAME.participants.entries())
            .filter(([originalName, data]) => !data.isAI) // AI가 아닌 사람만
            .forEach(([originalName, data]) => {
                // 해당 사용자의 소켓ID로 직접 전송
                const userData = usersByName.get(originalName);
                if (userData && userData.id) {
                    io.to(userData.id).emit(SOCKET_EVENTS.MAFIA_VOTE, {
                        phase: 'start',
                        participants: participantNames
                    });
                    console.log(`[투표 UI] ${originalName}(사람)에게 투표 UI 전송 성공 (소켓ID: ${userData.id})`);
                } else {
                    console.log(`[투표 UI 오류] ${originalName}의 사용자 데이터를 찾을 수 없음: userData=${!!userData}, id=${userData?.id}`);
                }
            });

        console.log(`[투표 UI] AI에게는 투표 UI를 전송하지 않음`);

        // AI 찾기 투표 타임아웃 (10초)
        MAFIA_GAME.votingTimeout = setTimeout(() => {
            if (MAFIA_GAME.gamePhase === 'voting') {
                console.log('[AI 찾기 투표] 10초 시간 초과로 투표 종료');
                endVotingPhase();
            }
        }, 10000);

    } catch (error) {
        console.error('[마피아 게임] 투표 페이즈 전환 오류:', error);
    }
}

function endVotingPhase() {
    try {
        MAFIA_GAME.gamePhase = 'results';

        // 투표 종료 시 모든 사람 플레이어에게 UI 닫기 이벤트 전송
        Array.from(MAFIA_GAME.participants.entries())
            .filter(([originalName, data]) => !data.isAI) // AI가 아닌 사람만
            .forEach(([originalName, data]) => {
                const userData = usersByName.get(originalName);
                if (userData && userData.id) {
                    io.to(userData.id).emit(SOCKET_EVENTS.MAFIA_VOTE, {
                        phase: 'end'
                    });
                    console.log(`[투표 UI] ${originalName}(사람) 투표 UI 닫기 전송 성공`);
                }
            });

        // 투표 결과 집계
        const voteResults = new Map();
        MAFIA_GAME.votes.forEach((votedFor, voter) => {
            voteResults.set(votedFor, (voteResults.get(votedFor) || 0) + 1);
        });

        // 가장 많이 투표받은 참가자 찾기
        let maxVotes = 0;
        let mostVoted = null;
        voteResults.forEach((votes, name) => {
            if (votes > maxVotes) {
                maxVotes = votes;
                mostVoted = name;
            }
        });

        // 실제 AI 찾기
        const actualAI = Array.from(MAFIA_GAME.participants.entries())
            .filter(([name, data]) => data.isAI && name !== MAFIA_GAME.gameHost)
            .map(([name, data]) => data.randomName);

        // 결과 발표
        const hostName = MAFIA_GAME.participants.get(MAFIA_GAME.gameHost)?.randomName || '게임진행자';
        
        let resultMessage = `🎯 ${MAFIA_GAME.currentRound}라운드 결과\n\n`;
        resultMessage += `가장 많은 의심을 받은 참가자: ${mostVoted || '없음'} (${maxVotes}표)\n`;
        resultMessage += `실제 AI: ${actualAI.join(', ')}\n\n`;

        console.log(`[투표 결과 분석] 가장 많이 투표받은 참가자: ${mostVoted}, 실제 AI: ${actualAI.join(', ')}`);
        console.log(`[투표 결과 분석] AI를 찾았는가: ${actualAI.includes(mostVoted)}`);
        console.log(`[투표 결과 분석] 전체 투표 현황:`, Array.from(MAFIA_GAME.votes.entries()));

        if (actualAI.includes(mostVoted)) {
            resultMessage += '🎉 AI를 찾아냈습니다!';
            
            // AI에게 투표한 사람 플레이어들에게만 +1점 부여 (AI는 제외)
            const correctVoters = [];
            const correctVoterNames = [];
            
            MAFIA_GAME.votes.forEach((votedFor, voter) => {
                console.log(`[투표 상세 분석] ${voter} -> ${votedFor} (AI 찾기: ${votedFor === mostVoted})`);
                
                // voter는 원래 사용자명(실제 대화명)이므로 직접 participants에서 찾기
                const voterData = MAFIA_GAME.participants.get(voter);
                
                if (voterData && votedFor === mostVoted) {
                    const originalName = voter; // voter가 이미 원래 사용자명
                    const participantData = voterData;
                    const isRealHuman = !participantData.isAI;
                    
                    console.log(`[정답 체크] ${participantData.randomName}(${originalName}): AI=${participantData.isAI}, 정답투표=${votedFor === mostVoted}`);
                    
                    if (isRealHuman) {
                        const currentScore = MAFIA_GAME.leaderboard.get(originalName) || 0;
                        MAFIA_GAME.leaderboard.set(originalName, currentScore + 1);
                        correctVoters.push(participantData.randomName);
                        correctVoterNames.push(originalName);
                        console.log(`[점수 시스템] ${participantData.randomName}(${originalName}) AI 찾기 성공으로 +1점 (현재: ${currentScore + 1}점)`);
                    }
                }
            });

            if (correctVoterNames.length > 0) {
                resultMessage += `\n\n🏆 AI를 찾은 플레이어: ${correctVoterNames.join(', ')}\n각각 +1점을 획득했습니다!`;
            }
        } else {
            resultMessage += '😅 AI를 찾지 못했습니다...';
        }

        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'mafia_result',
            from: hostName,
            content: resultMessage,
            timestamp: new Date().toISOString()
        });

        // 다음 라운드 또는 게임 종료
        setTimeout(() => {
            if (MAFIA_GAME.currentRound >= MAFIA_GAME.totalRounds) {
                endMafiaGame();
            } else {
                // 이름 다시 섞고 다음 라운드
                assignRandomNames();
                io.emit(SOCKET_EVENTS.MAFIA_UI_UPDATE, {
                    type: 'new_round',
                    closeVotingUI: true, // 투표 UI 강제 닫기 플래그 추가
                    participants: Array.from(MAFIA_GAME.participants.values()).map(p => ({
                        randomName: p.randomName,
                        isAI: p.isAI
                    }))
                });
                startMafiaRound();
            }
        }, 3000);

    } catch (error) {
        console.error('[마피아 게임] 결과 처리 오류:', error);
    }
}

function endMafiaGame() {
    try {
        // 게임 페이즈를 투표 모드로 변경
        MAFIA_GAME.gamePhase = 'leaderboard_voting';
        MAFIA_GAME.endGameVotes.clear();
        MAFIA_GAME.votingDeadline = Date.now() + 60000; // 1분 후 마감

        // 최종 리더보드 계산 및 순위 매기기
        console.log(`[리더보드 생성] 원본 점수 데이터:`, Array.from(MAFIA_GAME.leaderboard.entries()));
        
        const sortedLeaderboard = Array.from(MAFIA_GAME.leaderboard.entries())
            .sort((a, b) => b[1] - a[1]); // 점수 내림차순 정렬

        console.log(`[리더보드 생성] 정렬된 점수 데이터:`, sortedLeaderboard);

        // 모든 사람 참가자를 리더보드에 포함 (점수가 없으면 0점으로 처리)
        const allHumanParticipants = Array.from(MAFIA_GAME.participants.entries())
            .filter(([_, data]) => !data.isAI)
            .map(([originalName, _]) => originalName);

        console.log(`[리더보드 생성] 사람 참가자 목록:`, allHumanParticipants);

        // 모든 참가자의 점수 정리 (기록 없으면 0점)
        const completeLeaderboard = allHumanParticipants.map(name => {
            const score = MAFIA_GAME.leaderboard.get(name) || 0;
            return [name, score];
        }).sort((a, b) => b[1] - a[1]); // 점수 내림차순 정렬

        console.log(`[리더보드 생성] 완전한 리더보드:`, completeLeaderboard);

        // 리더보드 메시지 생성 (원래 사용자 대화명 기준)
        let leaderboardMessage = `🏆 마피아 게임 종료!\n총 ${MAFIA_GAME.totalRounds}라운드 완료\n\n`;
        
        if (completeLeaderboard.length > 0) {
            // 1등 대형 표시 (원래 대화명 사용) - 큰 글꼴과 굵은 글씨 효과
            const winner = completeLeaderboard[0];
            const winnerOriginalName = winner[0]; // 실제 사용자 대화명
            
            leaderboardMessage += `🏆═══════════════════🏆\n`;
            leaderboardMessage += `🥇  **🎉 1등: ${winnerOriginalName} 🎉**  🥇\n`;
            leaderboardMessage += `      **⭐ ${winner[1]}점 ⭐**      \n`;
            leaderboardMessage += `🏆═══════════════════🏆\n\n`;
            
            // 2등부터 순위별로 소형 표시 (원래 대화명 사용)
            if (completeLeaderboard.length > 1) {
                leaderboardMessage += `📋 전체 순위:\n`;
                for (let i = 1; i < completeLeaderboard.length; i++) {
                    const [originalName, score] = completeLeaderboard[i];
                    
                    const rankEmoji = i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}위`;
                    leaderboardMessage += `${rankEmoji} ${originalName}: ${score}점\n`;
                }
            }
        } else {
            leaderboardMessage += `참가자가 없습니다.`;
        }

        // 최종 리더보드 메시지 전송
        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'mafia_leaderboard',
            content: leaderboardMessage,
            timestamp: new Date().toISOString()
        });

        // 게임 종료 UI 표시 (투표 포함)
        io.emit(SOCKET_EVENTS.MAFIA_GAME_END, {
            totalRounds: MAFIA_GAME.totalRounds,
            leaderboard: completeLeaderboard,
            votingActive: true,
            votingDeadline: MAFIA_GAME.votingDeadline
        });

        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'system',
            content: `📊 리더보드가 1분간 표시됩니다.\n'채팅방 복귀' 또는 '한번 더' 중 선택해주세요!`,
            timestamp: new Date().toISOString()
        });

        // 1분 후 자동 투표 처리
        MAFIA_GAME.leaderboardTimeout = setTimeout(() => {
            processEndGameVotes();
        }, 60000);

        console.log('[마피아 게임] 리더보드 투표 시작 (1분간)');

    } catch (error) {
        console.error('[마피아 게임] 게임 종료 오류:', error);
        resetMafiaGame();
    }
}

function handleMafiaGameEnd() {
    try {
        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'system',
            content: '마피아 게임이 중단되었습니다.',
            timestamp: new Date().toISOString()
        });

        resetMafiaGame();
        io.emit(SOCKET_EVENTS.MAFIA_END);

        io.emit(SOCKET_EVENTS.MESSAGE, {
            type: 'system',
            content: '일반 채팅 모드로 복귀했습니다.',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[마피아 게임] 게임 중단 오류:', error);
    }
}

// 게임 종료 후 투표 처리
function handleEndGameVote(username, voteType) {
    try {
        if (MAFIA_GAME.gamePhase !== 'leaderboard_voting') {
            console.log(`[게임 종료 투표] ${username} 투표 거부: 게임 페이즈가 아님 (${MAFIA_GAME.gamePhase})`);
            return false;
        }

        if (!['chat', 'again'].includes(voteType)) {
            console.log(`[게임 종료 투표] ${username} 투표 거부: 잘못된 투표 타입 (${voteType})`);
            return false;
        }

        // 사람 플레이어만 투표 가능하도록 체크
        const participant = MAFIA_GAME.participants.get(username);
        if (!participant || participant.isAI) {
            console.log(`[게임 종료 투표] ${username} 투표 거부: AI 또는 참가자가 아님`);
            return false;
        }

        // 투표 기록
        MAFIA_GAME.endGameVotes.set(username, voteType);
        console.log(`[게임 종료 투표] ${username}: ${voteType} (사람 플레이어)`);

        // 실시간 투표 현황 업데이트
        const voteStats = {
            chat: 0,
            again: 0,
            total: MAFIA_GAME.endGameVotes.size
        };

        for (const vote of MAFIA_GAME.endGameVotes.values()) {
            voteStats[vote]++;
        }

        io.emit(SOCKET_EVENTS.MAFIA_VOTING_UPDATE, voteStats);

        // 모든 사람 참가자가 투표했는지 확인 (AI 제외)
        const humanParticipants = Array.from(MAFIA_GAME.participants.values()).filter(p => !p.isAI);
        const humanNames = humanParticipants.map(p => p.originalName);
        const votedNames = Array.from(MAFIA_GAME.endGameVotes.keys());
        
        console.log(`[게임 종료 투표] 사람 플레이어 목록: ${humanNames.join(', ')}`);
        console.log(`[게임 종료 투표] 투표한 플레이어: ${votedNames.join(', ')}`);
        console.log(`[게임 종료 투표] 현재 투표 현황: ${MAFIA_GAME.endGameVotes.size}/${humanParticipants.length} (사람 플레이어만)`);
        
        if (MAFIA_GAME.endGameVotes.size >= humanParticipants.length) {
            console.log('[게임 종료 투표] 모든 사람 참가자 투표 완료, 즉시 처리');
            if (MAFIA_GAME.leaderboardTimeout) {
                clearTimeout(MAFIA_GAME.leaderboardTimeout);
            }
            processEndGameVotes();
        }

        return true;
    } catch (error) {
        console.error('[게임 종료 투표] 오류:', error);
        return false;
    }
}

// 투표 결과 처리
function processEndGameVotes() {
    try {
        console.log('[게임 종료 투표] 투표 결과 처리 시작');
        
        // 투표 집계
        let chatVotes = 0;
        let againVotes = 0;

        for (const vote of MAFIA_GAME.endGameVotes.values()) {
            if (vote === 'chat') chatVotes++;
            else if (vote === 'again') againVotes++;
        }

        const totalVotes = chatVotes + againVotes;
        let result;

        if (totalVotes === 0) {
            // 아무도 투표하지 않음 -> 기본값: 채팅방 복귀
            result = 'chat';
            io.emit(SOCKET_EVENTS.MESSAGE, {
                type: 'system',
                content: '🔸 투표가 없어 일반 채팅방으로 복귀합니다.',
                timestamp: new Date().toISOString()
            });
        } else if (chatVotes > againVotes) {
            result = 'chat';
            io.emit(SOCKET_EVENTS.MESSAGE, {
                type: 'system',
                content: `📊 투표 결과: 채팅방 복귀 ${chatVotes}표, 한번 더 ${againVotes}표\n일반 채팅방으로 복귀합니다!`,
                timestamp: new Date().toISOString()
            });
        } else if (againVotes > chatVotes) {
            result = 'again';
            io.emit(SOCKET_EVENTS.MESSAGE, {
                type: 'system',
                content: `📊 투표 결과: 채팅방 복귀 ${chatVotes}표, 한번 더 ${againVotes}표\n새로운 마피아 게임을 시작합니다!`,
                timestamp: new Date().toISOString()
            });
        } else {
            // 동점 -> 기본값: 채팅방 복귀
            result = 'chat';
            io.emit(SOCKET_EVENTS.MESSAGE, {
                type: 'system',
                content: `📊 투표 결과: 동점 (각 ${chatVotes}표)\n일반 채팅방으로 복귀합니다!`,
                timestamp: new Date().toISOString()
            });
        }

        console.log(`[게임 종료 투표] 최종 결과: ${result} (채팅방 ${chatVotes}표, 한번 더 ${againVotes}표)`);

        if (result === 'chat') {
            // 채팅방 복귀
            setTimeout(() => {
                resetMafiaGame();
                io.emit(SOCKET_EVENTS.MAFIA_END);
                
                io.emit(SOCKET_EVENTS.MESSAGE, {
                    type: 'system',
                    content: '✅ 일반 채팅 모드로 복귀했습니다.',
                    timestamp: new Date().toISOString()
                });
            }, 2000);
        } else {
            // 새 게임 시작
            setTimeout(() => {
                // 새 게임 시작 안내
                io.emit(SOCKET_EVENTS.MESSAGE, {
                    type: 'system',
                    content: '🎮 새로운 마피아 게임을 시작합니다!',
                    timestamp: new Date().toISOString()
                });
                
                // 먼저 리더보드 UI 정리
                io.emit(SOCKET_EVENTS.MAFIA_END);
                
                setTimeout(() => {
                    resetMafiaGame();
                    
                    // 자동으로 새 게임 시작
                    const newGameMessage = {
                        content: '/마피아 3',
                        from: 'System',
                        fromSocketId: null
                    };
                    handleMafiaGameStart(newGameMessage);
                }, 1000);
            }, 2000);
        }

    } catch (error) {
        console.error('[게임 종료 투표] 처리 오류:', error);
        // 오류 시 기본값: 채팅방 복귀
        resetMafiaGame();
        io.emit(SOCKET_EVENTS.MAFIA_END);
    }
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
    // === AI 혼자 모드에서는 사회자 개입 불필요 ===
    const allAIs = Array.from(users.values()).filter(u => u.isAI);
    if (allAIs.length <= 1) {
        console.log(`[사회자 차단] AI가 ${allAIs.length}명이므로 사회자 개입이 불필요합니다.`);
        return false; // AI 혼자이거나 없으면 사회자 개입 안함
    }
    
    const timeSinceLastModerator = Date.now() - lastModeratorTime;
    const turnCountReached = moderatorTurnCount >= config.MODERATOR_TURN_COUNT;
    const timeIntervalReached = timeSinceLastModerator >= config.MODERATOR_INTERVAL;
    
    const shouldIntervene = turnCountReached || timeIntervalReached;
    
    if (shouldIntervene) {
        console.log(`[사회자 개입 조건] AI ${allAIs.length}명, 턴: ${moderatorTurnCount}/${config.MODERATOR_TURN_COUNT}, 시간: ${Math.round(timeSinceLastModerator/1000)}초/${config.MODERATOR_INTERVAL/1000}초`);
    }
    
    return shouldIntervene;
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

        const result = await apiLimiter.executeAPICall(
            async (contents, config) => await model.generateContent({
                contents: contents,
                generationConfig: config
            }),
            [{ role: 'user', parts: [{ text: moderatorPrompt }] }],
            { 
                maxOutputTokens: 1000,
                temperature: 0.7
            }
        );
        
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

        // === AI 혼자 모드 감지 + 자기 인식 데이터 준비 ===
        const allAIs = Array.from(users.values()).filter(u => u.isAI);
        const otherAIs = allAIs.filter(ai => ai.username !== aiName);
        const isAloneAI = otherAIs.length === 0;

        const myRecentMessages = context
            .filter(msg => msg.from === aiName)
            .slice(-2)  // 최근 2개만
            .map(msg => msg.content)
            .join(', ');

        // === 4단계: 조건부 프롬프트 로딩 (토큰 절약) ===
        const conditionalMemory = memories.length > 0 ? `
---
# 최근 발언 기억
- ${memories.join('\n- ')}
---
위 내용을 반복하지 말고 새로운 관점을 제시하세요.
` : '';

        const conditionalModerator = (lastModeratorDirective && Date.now() < moderatorDirectiveExpiry) ? `
🚨 **사회자 지시**:
${lastModeratorDirective.summary ? `요약: ${lastModeratorDirective.summary}` : ''}
${lastModeratorDirective.highlight ? `주목: ${lastModeratorDirective.highlight}` : ''}
${lastModeratorDirective.nextTopic ? `주제: ${lastModeratorDirective.nextTopic}` : ''}
` : '';

        // === 2단계: 중복 경고 통합 ===
        const unifiedSelfAwareness = (() => {
            if (isAloneAI) {
                return `\n🤖 혼자 모드: 유일한 AI로서 사용자와만 대화하세요.`;
            } else if (myRecentMessages) {
                return `\n🚨 자기 인식: 당신(${aiName}) 최근 발언 "${myRecentMessages}". 이에 응답 금지.`;
            } else {
                return `\n당신은 ${aiName}입니다.`;
            }
        })();

        // === 1단계: 반복 설명 제거 (간소화된 프롬프트) ===
        const stylePrompt = `당신은 '${aiName}' (페르소나: ${persona})입니다.
${conditionalMemory}${conditionalModerator}${unifiedSelfAwareness}

<핵심 규칙>
1. 사회자 지시 최우선 실행
2. 7가지 반응 중 하나 선택: [의견 확장] [반론 제기] [핵심 질문] [아이디어 추가] [감정적 공감] [정보 보강] [유머/위트]
3. 선택한 태그로 시작 (예: [핵심 질문] 그 근거는?)
4. AI 정체성 숨기고 자연스럽게 대화
5. 8문장 이내 간결 응답
6. 절대 금지: 행동 묘사, 지문 표현 금지

실제 채팅 메시지만 출력하세요. 대화 내용에만 집중하고 행동이나 표정 묘사는 절대 포함하지 마세요.`;
        
        const historyForGemini = context;
        
        const collapsedHistory = [];
        if (historyForGemini.length > 0) {
            let lastRole = null;
            for (const msg of historyForGemini) {
                const currentRole = msg.from === aiName ? 'model' : 'user';
                // === 깨끗한 컨텍스트 (메타데이터 오염 제거) ===
                const text = `${msg.from}: ${msg.content}`;  // 모든 메시지를 동일 형식으로
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

        // 마피아 게임 중일 때는 웹 검색 기능 비활성화
        if (needsSearch && !MAFIA_GAME.isActive) {
            apiCallOptions.tools = searchTool;
            console.log(`[도구 사용] 검색 키워드가 감지되어, AI '${aiName}'에게 검색 도구를 활성화합니다.`);
        } else if (needsSearch && MAFIA_GAME.isActive) {
            console.log(`[마피아 게임] AI '${aiName}'의 웹 검색 요청이 마피아 모드로 인해 차단되었습니다.`);
        }

        const result = await apiLimiter.executeAPICall(
            async (contents, options, config) => await model.generateContent({ 
            contents, 
                ...options,
                generationConfig: config
            }),
            contents,
            apiCallOptions,
            { temperature: user.temperature, topK: user.topK, topP: user.topP, maxOutputTokens: 2048 }
        );
        
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
        
        aiResponse = aiResponse.replace(/['"""']/g, '');

        // === 🚨 중복 문장 제거 (API 중복 응답 방지) ===
        const sentences = aiResponse.split(/(?<=[.!?])\s+/);
        const uniqueSentences = [];
        const seenSentences = new Set();
        
        for (const sentence of sentences) {
            const normalized = sentence.trim().replace(/\s+/g, ' ');
            if (normalized && !seenSentences.has(normalized)) {
                seenSentences.add(normalized);
                uniqueSentences.push(sentence);
            }
        }
        aiResponse = uniqueSentences.join(' ').trim();

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
    
    // === 마피아 게임 중에는 일반 대화 로직 중단 ===
    if (MAFIA_GAME.isActive) {
        console.log('[마피아 게임] 마피아 게임 중이므로 일반 대화 AI 응답을 중단합니다.');
        return []; // 마피아 게임 중에는 일반 AI 응답 시스템 비활성화
    }
    
    // === AI 혼자 모드 체크: AI가 혼자일 때는 자신의 메시지에 응답하지 않음 ===
    const allAIs = Array.from(users.values()).filter(u => u.isAI);
    if (allAIs.length === 1 && msgObj.from.startsWith('AI-')) {
        console.log(`[혼자 모드] ${msgObj.from}이(가) 유일한 AI이므로 자신의 메시지에 응답하지 않습니다.`);
        return []; // 빈 배열 반환으로 아무도 응답하지 않음
    }
    
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
        
        // === 자기 메시지 응답 방지 (다중 AI 환경에서) ===
        if (ai.username === msgObj.from) {
            console.log(`[자기 응답 방지] ${ai.username}이(가) 자신의 메시지에 응답하지 않습니다.`);
            return { user: ai, score: 0 };
        }

        // 🎯 AI 응답 타이밍 검증 (구글 수석 프로그래머 수준 최적화)
        const isModerator = participantRoles.get(ai.username) === AI_ROLES.MODERATOR;
        const timingCheck = canAIRespond(ai.username, isModerator);
        
        if (!timingCheck.canRespond) {
            // 🎯 타이밍 검증 완화: 남은 시간이 1초 이하면 통과
            if (timingCheck.remainingTime && timingCheck.remainingTime < 1000) {
                console.log(`[AI 타이밍 완화] ${ai.username}: 거의 완료됨 (${Math.round(timingCheck.remainingTime)}ms 남음)`);
            } else {
                console.log(`[AI 타이밍 검증] ${ai.username}: ${timingCheck.reason}`);
                return { user: ai, score: 0 };
            }
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
    
    // 🎯 대화 끊김 방지: 응답자 수 최적화
    const isModeratorDirective = msgObj.isModeratorDirective || false;
    const maxResponders = isModeratorDirective ? 
        Math.min(nonMentionedAIs.length, 3) : // 사회자 지시 시 최대 3명
        Math.min(nonMentionedAIs.length, 2); // 평상시 최대 2명 (순차 딜레이 테스트)
    
    const scoreThreshold = isModeratorDirective ? 40 : 60; // 사회자 지시 시 참여 문턱 낮춤

    // 🎯 대화 연속성 보장: 최소 1명은 항상 응답하도록 보장
    let selectedCount = 0;
    for (let i = 0; i < maxResponders; i++) {
        const selected = nonMentionedAIs[i];
        if (selected.score > scoreThreshold && selected.user.username !== mentionedAI) {
            console.log(`[참여 결정] ${selected.user.username}`);
            // 🎯 지능형 딜레이 계산 (구글 수석 프로그래머 수준 최적화)
            const baseDelay = config.AI_RESPONSE_BASE_DELAY;
            const sequentialDelay = i === 0 ? 3000 : (3000 + (i * 4000)); // 첫 번째는 3초, 그 뒤는 3+4초씩 증가
            const randomDelay = Math.floor(Math.random() * config.AI_RESPONSE_RANDOM_DELAY);
            const totalDelay = baseDelay + sequentialDelay + randomDelay;
            
            console.log(`[AI 딜레이 계산] ${selected.user.username}: 기본(${baseDelay}ms) + 순차(${sequentialDelay}ms) + 랜덤(${randomDelay}ms) = ${totalDelay}ms`);
            
            respondingAIs.push({
                aiName: selected.user.username,
                delay: totalDelay,
                targetName: msgObj.from
            });
            selectedCount++;
        }
    }
    
    // 🎯 대화 연속성 보장: 아무도 선택되지 않았다면 최고 점수 AI 강제 선택
    if (selectedCount === 0 && nonMentionedAIs.length > 0) {
        const bestAI = nonMentionedAIs[0];
        console.log(`[대화 연속성 보장] ${bestAI.user.username}을(를) 강제 선택 (점수: ${bestAI.score})`);
        
        const baseDelay = config.AI_RESPONSE_BASE_DELAY;
        const randomDelay = Math.floor(Math.random() * config.AI_RESPONSE_RANDOM_DELAY);
        const totalDelay = baseDelay + randomDelay;
        
        respondingAIs.push({
            aiName: bestAI.user.username,
            delay: totalDelay,
            targetName: msgObj.from
        });
    }
    
    // 턴 카운터 증가 (사회자가 개입하지 않은 경우)
    if (respondingAIs.length > 0) {
        moderatorTurnCount++;
    }
    
    // 🎯 AI 대화 상태 로깅 (디버깅)
    if (respondingAIs.length > 0) {
        console.log(`[AI 응답 예정] ${respondingAIs.length}명의 AI가 응답할 예정입니다:`);
        respondingAIs.forEach((ai, index) => {
            console.log(`  ${index + 1}. ${ai.aiName} (${ai.delay}ms 후)`);
        });
        logAIConversationStatus();
    } else {
        console.log('[AI 응답] 현재 응답할 AI가 없습니다.');
        logAIConversationStatus();
    }
    
    return respondingAIs;
}

function markMentionAsAnswered(messageId, aiName) {
    console.log(`[멘션 처리] ${aiName}이(가) 메시지 ${messageId}에 응답했습니다.`);
}

// 🎯 AI 응답 타이밍 검증 함수들
function canAIRespond(aiName, isModerator = false) {
    const now = Date.now();
    
    // 진행자 AI는 제외 (항상 응답 가능)
    if (isModerator && AI_RESPONSE_TIMING.MODERATOR_EXEMPT) {
        return { canRespond: true, reason: '진행자 AI는 제외' };
    }
    
    // AI 간 최소 응답 간격 확인 (구글 수석 프로그래머 수준 수정)
    const lastResponseTime = aiLastResponseTime.get(aiName) || 0;
    const timeSinceLastResponse = now - lastResponseTime;
    
    if (timeSinceLastResponse < AI_RESPONSE_TIMING.MIN_INTERVAL) {
        return { 
            canRespond: false, 
            reason: `AI 간 최소 간격 미충족 (${Math.round(timeSinceLastResponse/1000)}초 경과, 필요: ${AI_RESPONSE_TIMING.MIN_INTERVAL/1000}초)`,
            remainingTime: AI_RESPONSE_TIMING.MIN_INTERVAL - timeSinceLastResponse
        };
    }
    
    // 같은 AI 재응답 쿨다운 확인
    const lastSpeakTime = aiLastSpeakTime.get(aiName) || 0;
    const timeSinceLastSpeak = now - lastSpeakTime;
    
    if (timeSinceLastSpeak < AI_RESPONSE_TIMING.AI_COOLDOWN) {
        return { 
            canRespond: false, 
            reason: `AI 재응답 쿨다운 미충족 (${Math.round(timeSinceLastSpeak/1000)}초 경과, 필요: ${AI_RESPONSE_TIMING.AI_COOLDOWN/1000}초)`,
            remainingTime: AI_RESPONSE_TIMING.AI_COOLDOWN - timeSinceLastSpeak
        };
    }
    
    return { canRespond: true, reason: '모든 조건 충족' };
}

function updateAIResponseTime(aiName) {
    const now = Date.now();
    aiLastResponseTime.set(aiName, now);
    aiLastSpeakTime.set(aiName, now);
    console.log(`[AI 타이밍] ${aiName} 응답 시간 업데이트: ${new Date(now).toLocaleTimeString()}`);
}

// 🎯 AI 대화 연속성 모니터링 시스템
function getAIConversationStats() {
    const now = Date.now();
    const stats = {
        totalAIs: Array.from(users.values()).filter(u => u.isAI).length,
        activeAIs: 0,
        cooldownAIs: 0,
        readyAIs: 0,
        details: []
    };
    
    Array.from(users.values()).filter(u => u.isAI).forEach(ai => {
        const isModerator = participantRoles.get(ai.username) === AI_ROLES.MODERATOR;
        const timingCheck = canAIRespond(ai.username, isModerator);
        
        if (timingCheck.canRespond) {
            stats.readyAIs++;
        } else {
            stats.cooldownAIs++;
        }
        
        stats.details.push({
            aiName: ai.username,
            isModerator,
            canRespond: timingCheck.canRespond,
            reason: timingCheck.reason,
            lastResponse: aiLastResponseTime.get(ai.username) || 0,
            lastSpeak: aiLastSpeakTime.get(ai.username) || 0
        });
    });
    
    return stats;
}

// 🎯 AI 대화 상태 로깅 (디버깅용)
function logAIConversationStatus() {
    const stats = getAIConversationStats();
    console.log(`[AI 대화 상태] 총 AI: ${stats.totalAIs}, 응답 가능: ${stats.readyAIs}, 쿨다운: ${stats.cooldownAIs}`);
    
    if (stats.cooldownAIs > 0) {
        console.log('[AI 쿨다운 상세]');
        stats.details.filter(d => !d.canRespond).forEach(d => {
            console.log(`  - ${d.aiName}: ${d.reason}`);
        });
    }
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

                    // 🎯 AI 응답 시간 업데이트 (타이밍 관리)
                    updateAIResponseTime(aiName);

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
# 지시: 전문 회의록 작성 (대기업 표준)

당신은 대기업의 전문 회의록 작성자입니다. 아래 대화 내용을 바탕으로 최고 수준의 구조화된 회의록을 작성해주십시오.

### 작성 프로세스

1.  **[1단계: 핵심 주제 식별]**
    전체 대화를 분석하여 논의된 **대주제를 3~5개 이내로 식별**합니다.

2.  **[2단계: 주제별 세부 분류]**
    각 대주제별로 논의된 **세부 주제들을 식별**하고, 다음 논의 패턴 중 하나로 **내부적으로 분류**합니다:
    - **문제 해결형**: 문제 제기 → 원인 분석 → 해결방안 → 결론
    - **정보 공유형**: 정보 제시 → 질의응답 → 추가 논의 → 정리
    - **의견 수렴형**: 주제 제시 → 다양한 관점 → 토론 → 합의점
    - **기획/검토형**: 제안 → 검토 → 수정사항 → 승인/보류
    
    **중요**: 논의 패턴은 내용 구성을 위한 내부 분석 도구로만 사용하고, 최종 회의록에는 노출하지 않습니다.

3.  **[3단계: 계층적 구조화]**
    각 논의 패턴에 맞는 전문 템플릿을 내부적으로 적용하여 체계적으로 정리하되, 패턴명은 회의록에 표시하지 않습니다.

4.  **[4단계: 최종 포맷팅]**
    대기업 회의록 표준에 맞게 최종 정리합니다.

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
**각 대주제별로 다음과 같은 계층적 구조로 작성하시오:**

## 1. [대주제명]

### 1.1 [세부주제명]
**논의 배경**: (해당 주제가 왜 논의되었는지)
**핵심 내용**: (주요 논의 사항들을 체계적으로 정리)
- 제기된 의견/문제점
- 논의된 관점들
- 제안된 해결방안/대안
**논의 결과**: (해당 세부주제의 결론 또는 합의점)

### 1.2 [다음 세부주제명]
(위와 동일한 구조로 반복)

## 2. [다음 대주제명]
(위와 동일한 구조로 반복)

#### 결정 사항
(논의를 통해 최종적으로 합의되거나 결정된 사항들을 명확하게 조목별로 기입. 결정된 내용이 없다면 "해당 없음"으로 기재)

#### 실행 항목 (Action Items)
(결정 사항에 따라 발생한 후속 조치 사항을 기입. "담당자", "업무 내용", "기한"을 명시하여 <table> 태그를 사용한 HTML 표 형식으로 정리. 실행 항목이 없다면 "해당 없음"으로 기재. 반드시 아래 예시처럼 <table> 태그를 사용하여 출력할 것.)

<!-- 예시: 실행 항목 표 (반드시 <table> 태그 사용) -->
<table>
  <thead>
    <tr>
      <th>순번</th>
      <th>실행 내용</th>
      <th>담당자</th>
      <th>완료 기한</th>
      <th>우선순위</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>정보원, 교란자 역할 카드 세부 규칙 및 튜토리얼 초안 작성</td>
      <td>AI3</td>
      <td>2025. 7. 8.</td>
      <td>높음</td>
    </tr>
    <!-- ... -->
  </tbody>
</table>

---

### 논의 패턴별 분석 가이드 (내부 참조용)

**다음은 내용 구성을 위한 내부 분석 도구입니다. 실제 회의록에는 패턴명을 노출하지 않습니다.**

**문제 해결형 논의 구조:**
- 논의 배경: 어떤 문제나 이슈가 제기되었는가?
- 핵심 내용: 문제의 원인 → 영향도 분석 → 해결 방안들 → 방안별 장단점
- 논의 결과: 채택된 해결방안 또는 추후 검토 방향

**정보 공유형 논의 구조:**
- 논의 배경: 어떤 정보가 공유되어야 했는가?
- 핵심 내용: 제시된 정보 → 참여자별 질문 → 추가 설명 → 파생 논의
- 논의 결과: 공유된 핵심 정보 요약 및 후속 조치

**의견 수렴형 논의 구조:**
- 논의 배경: 어떤 주제에 대한 의견 수렴이 필요했는가?
- 핵심 내용: 제시된 관점들 → 찬반 의견 → 논쟁점 → 타협안
- 논의 결과: 합의점 또는 추후 재논의 필요 사항

**기획/검토형 논의 구조:**
- 논의 배경: 어떤 계획이나 제안이 검토되었는가?
- 핵심 내용: 제안 내용 → 검토 의견 → 수정 요구사항 → 보완방안
- 논의 결과: 승인/조건부 승인/보류/거부 및 사유

**🚨 절대 준수 사항 (형식 관련):**
1. **줄바꿈 필수**: "**논의 배경**:", "**핵심 내용**:", "**논의 결과**:" 각각은 반드시 새로운 줄에서 시작해야 함
2. **마크다운 헤딩 정확 사용**: ## 대주제, ### 세부주제 (앞뒤로 빈 줄 필수)
3. **들여쓰기 금지**: 모든 소제목(**논의 배경** 등)은 들여쓰기 없이 첫 번째 열에서 시작
4. **각 섹션 분리**: 논의 배경, 핵심 내용, 논의 결과 사이에는 반드시 빈 줄 삽입
5. **일관된 형식**: 모든 세부주제에서 동일한 형식 적용

**내용 관련 지시사항:**
6. 각 세부주제는 반드시 위 4가지 패턴 중 하나로 **내부적으로만 분류**하고, 최종 회의록에는 패턴명을 노출하지 말 것
7. 참여자별 의견은 익명화하되, 의견의 다양성은 보존할 것
8. 논의가 결론에 도달하지 못한 경우도 명확히 기록할 것
9. 전문적이고 객관적인 어조를 유지할 것
10. **표 형태 시각화 활용**: 다음 상황에서는 반드시 마크다운 표를 사용할 것

### 표 활용 가이드

**1. 대안/옵션 비교 시:**
| 구분 | 옵션A | 옵션B | 옵션C |
|------|-------|-------|-------|
| 장점 | ... | ... | ... |
| 단점 | ... | ... | ... |
| 비용 | ... | ... | ... |
| 기간 | ... | ... | ... |

**2. 찬반 의견 정리 시:**
| 논점 | 찬성 의견 | 반대 의견 | 절충안 |
|------|-----------|-----------|--------|
| 핵심 이슈1 | ... | ... | ... |
| 핵심 이슈2 | ... | ... | ... |

**3. 평가/검토 결과 시:**
| 평가 기준 | 현재 상태 | 목표 | 개선 방안 |
|-----------|-----------|------|-----------|
| 품질 | ... | ... | ... |
| 일정 | ... | ... | ... |
| 예산 | ... | ... | ... |

**4. 실행 항목 정리 시:**
| 순번 | 실행 내용 | 담당자 | 완료 기한 | 우선순위 |
|------|-----------|--------|-----------|----------|
| 1 | ... | ... | ... | 높음 |
| 2 | ... | ... | ... | 중간 |

**5. 일정/단계별 계획 시:**
| 단계 | 주요 활동 | 기간 | 산출물 | 비고 |
|------|-----------|------|--------|------|
| 1단계 | ... | ... | ... | ... |
| 2단계 | ... | ... | ... | ... |

**표 사용 원칙:**
- 3개 이상의 항목을 비교할 때 표 사용 필수
- 복잡한 정보를 체계적으로 정리할 때 표 우선 고려
- 표 제목을 명확히 작성하여 내용을 쉽게 파악할 수 있도록 할 것
- 표 내용은 간결하게 핵심만 기입할 것

---

### 최종 회의록 출력 예시

다음과 같은 형태로 깔끔하고 전문적인 회의록이 생성되어야 합니다:

**✅ 올바른 형식 예시 (이렇게 작성해야 함):**

## 1. 프로젝트 진행 현황

### 1.1 개발 일정 검토

**논의 배경**: 기존 일정 대비 2주 지연 상황 발생

**핵심 내용**:
- 지연 원인: 기술적 복잡성 증가, 외부 API 연동 이슈
- 영향도 분석: 전체 프로젝트 일정에 미치는 영향 검토
- 제안된 해결방안: 우선순위 재조정, 추가 인력 투입, 외주 활용

**논의 결과**: 핵심 기능 우선 개발 후 부가 기능은 2단계로 분리 추진

### 1.2 예산 현황 점검

**논의 배경**: 분기별 예산 사용 현황 공유 필요

**핵심 내용**:
- 예산 사용률: 전체 예산의 65% 사용 완료
- 주요 사용 항목: 개발비 70%, 마케팅비 40%, 운영비 55%
- 잔여 예산 현황: 개발비 부족, 마케팅비 여유 상태

**논의 결과**: 개발비 추가 확보 필요, 마케팅비 일부 전용 검토

**❌ 잘못된 형식 (피해야 할 형식):**
논의 배경: 기존 일정 대비 2주 지연 상황 발생 핵심 내용: 지연 원인... 논의 결과: 핵심 기능 우선...

**🔥 최종 확인 사항**: 
- 논의패턴명("문제해결형", "의견수렴형" 등)은 절대 노출되지 않아야 함
- 마크다운 헤딩(##, ###)을 정확히 사용하여 계층구조 명확화
- 표는 복잡한 정보 정리 시 적극 활용
- **이 회의록 작성에는 간결함보다 정확한 형식이 우선임**: 줄바꿈과 구조화를 철저히 지켜야 함
- **토큰 절약을 위해 형식을 생략하지 말 것**: 전문 회의록의 품질이 최우선

---

**📋 대화 원본 데이터**
${meetingHistory.map(m => `${m.from}: ${m.content}`).join('\n')}

---

상기 지시사항과 양식에 따라, 전문가 수준의 회의록을 마크다운 형식으로 작성해주십시오.
    `.trim();

    try {
        const generationConfig = { 
            ...model.generationConfig, 
            maxOutputTokens: config.MEETING_MINUTES_MAX_TOKENS 
        };
        const result = await apiLimiter.executeAPICall(
            async (contents, config) => await model.generateContent({ contents, generationConfig: config }),
            [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig
        );
        const meetingMinutes = (await result.response).text();

        const meetingNotesMessage = {
            id: `meeting_notes_${Date.now()}`,
            from: scribe.username,
            type: 'meeting_notes',
            content: `--- 회의록 (작성자: ${scribe.username}) ---\n\n${meetingMinutes}`,
            timestamp: new Date().toISOString()
        };

        // 회의록을 별도 저장소에 저장 (AI 대화 컨텍스트와 분리)
        meetingMinutesStorage.push(meetingNotesMessage);
        
        // 클라이언트에 회의록 방송
        io.emit(SOCKET_EVENTS.MESSAGE, meetingNotesMessage);
        
        console.log(`[회의록 모드] ${scribe.username}이(가) 회의록 작성을 완료하고 전송했습니다. 시스템은 사용자의 다음 입력을 대기합니다.`);

    } catch (error) {
        console.error('회의록 생성 중 오류:', error);
        const errorMessage = {
            id: `meeting_error_${Date.now()}`,
            from: 'System',
            type: 'system',
            content: `${scribe.username}이(가) 회의록을 작성하는 데 실패했습니다.`,
            timestamp: new Date().toISOString()
        };
        
        // 시스템 메시지는 conversationContext에 저장 (일반 시스템 메시지이므로)
        conversationContext.addMessage(errorMessage);
        
        // 클라이언트에 오류 메시지 방송
        io.emit(SOCKET_EVENTS.MESSAGE, errorMessage);
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

    // 🛡️ 무한 루프 방지: 이미 처리된 메시지인지 확인
    if (processedMessageIds.has(stimulus.id)) {
        console.log(`[무한 루프 방지] 이미 처리된 메시지 건너뜀: ${stimulus.id} - ${stimulus.content.substring(0, 30)}...`);
        isProcessingTurn = false;
        processTurnQueue();
        return;
    }

    // 처리된 메시지 ID 추가
    processedMessageIds.add(stimulus.id);
    console.log(`[메시지 처리] ${stimulus.id} - ${stimulus.content.substring(0, 30)}... (처리됨 표시: ${processedMessageIds.size}개)`);

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
    // === AI 혼자 모드 체크: AI가 혼자일 때는 자신의 메시지를 큐에 추가하지 않음 ===
    if (msgObj.from.startsWith('AI-')) {
        const allAIs = Array.from(users.values()).filter(u => u.isAI);
        if (allAIs.length === 1) {
            console.log(`[혼자 모드] ${msgObj.from}이(가) 유일한 AI이므로 연쇄 응답을 방지합니다. 사용자 입력을 기다립니다.`);
            return; // AI 혼자면 자신의 메시지를 큐에 추가하지 않음
        }
    }

    // 🛡️ 중복 메시지 큐 추가 방지
    const existsInQueue = turnQueue.some(turn => turn.stimulus && turn.stimulus.id === msgObj.id);
    if (existsInQueue) {
        console.log(`[중복 방지] 이미 큐에 있는 메시지 건너뜀: ${msgObj.id} - ${msgObj.content.substring(0, 30)}...`);
        return;
    }

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
    
    // 🛡️ 추가 안전장치: 큐 크기 제한 (무한 누적 방지)
    if (turnQueue.length > 50) {
        console.warn(`[큐 오버플로우 방지] 턴 큐가 ${turnQueue.length}개로 과도하게 누적됨. 절반 정리.`);
        turnQueue.splice(0, Math.floor(turnQueue.length / 2));
    }
    
    const nextTurn = turnQueue.shift();
    await processConversationTurn(nextTurn);
}

// ===================================================================================
// PPT 생성 시스템
// ===================================================================================

// 🔧 구조화된 안전한 PPT 생성 함수 (AI 분석 + 색상 없는 디자인)
function createUltraSimplePPT(meetingData, pptStructure) {
    try {
        console.log('[구조화 PPT] 생성 시작');
        
        const pptx = new PptxGenJS();
        
        // 기본 메타데이터 설정
        pptx.author = 'AI 회의록 시스템';
        pptx.title = pptStructure.title || '회의 결과 보고서';
        
        console.log('[구조화 PPT] 메타데이터 설정 완료');
        
        // pptStructure가 있으면 구조화된 슬라이드 생성, 없으면 기본 구조
        if (pptStructure && pptStructure.slides && pptStructure.slides.length > 0) {
            console.log(`[구조화 PPT] ${pptStructure.slides.length}개 구조화된 슬라이드 생성 시작`);
            
            // 각 슬라이드를 안전하게 생성
            for (let i = 0; i < pptStructure.slides.length; i++) {
                const slideData = pptStructure.slides[i];
                
                try {
                    console.log(`[구조화 PPT] 슬라이드 ${i + 1} 생성 중: ${slideData.type}`);
                    
                    const slide = pptx.addSlide();
                    
                    // 슬라이드 타입별 안전한 생성
                    switch (slideData.type) {
                        case 'title':
                            createSafeTitleSlide(slide, slideData);
                            break;
                        case 'agenda':
                            createSafeAgendaSlide(slide, slideData);
                            break;
                        case 'topic':
                            createSafeTopicSlide(slide, slideData);
                            break;
                        case 'decisions':
                            createSafeDecisionsSlide(slide, slideData);
                            break;
                        case 'actions':
                            createSafeActionsSlide(slide, slideData);
                            break;
                        default:
                            createSafeContentSlide(slide, slideData);
                    }
                    
                    console.log(`[구조화 PPT] 슬라이드 ${i + 1} 생성 완료`);
                    
                } catch (slideError) {
                    console.error(`[구조화 PPT] 슬라이드 ${i + 1} 생성 실패:`, slideError);
                    
                    // 오류 슬라이드로 대체
                    createErrorSlide(pptx.addSlide(), `슬라이드 ${i + 1}`, slideData.title || '제목 없음');
                }
            }
            
        } else {
            console.log('[구조화 PPT] 구조 정보 없음, 기본 분석 슬라이드 생성');
            createBasicAnalyzedSlides(pptx, meetingData);
        }
        
        console.log('[구조화 PPT] 전체 생성 완료');
        return pptx;
        
    } catch (error) {
        console.error('[구조화 PPT] 생성 실패:', error);
        return createEmergencyPPT(meetingData);
    }
}

// 액션 객체를 사람이 읽기 쉬운 텍스트로 변환
function formatActionObject(action) {
    if (typeof action !== 'object' || !action) {
        return String(action);
    }
    
    const parts = [];
    
    // 액션 내용
    if (action.action) {
        parts.push(`📋 ${action.action}`);
    }
    
    // 담당자
    if (action.owner) {
        parts.push(`👤 담당자: ${action.owner}`);
    }
    
    // 기한
    if (action.deadline) {
        parts.push(`⏰ 기한: ${action.deadline}`);
    }
    
    // 우선순위
    if (action.priority) {
        const priorityEmoji = action.priority === 'high' ? '🔥' : 
                             action.priority === 'medium' ? '⚡' : '📋';
        parts.push(`${priorityEmoji} 우선순위: ${action.priority}`);
    }
    
    return parts.length > 0 ? parts.join('\n') : String(action);
}

// 결정사항 객체를 사람이 읽기 쉬운 텍스트로 변환
function formatDecisionObject(decision) {
    if (typeof decision !== 'object' || !decision) {
        return String(decision);
    }
    
    const parts = [];
    
    // 결정 내용
    if (decision.decision) {
        parts.push(`✅ ${decision.decision}`);
    }
    
    // 배경/이유
    if (decision.background || decision.reason) {
        parts.push(`💡 배경: ${decision.background || decision.reason}`);
    }
    
    // 담당자
    if (decision.owner) {
        parts.push(`👤 담당자: ${decision.owner}`);
    }
    
    // 기한
    if (decision.deadline) {
        parts.push(`⏰ 이행 기한: ${decision.deadline}`);
    }
    
    return parts.length > 0 ? parts.join('\n') : String(decision);
}

// 안전한 텍스트 변환 함수 (간소화됨)
function safeTextForPPT(value, fallback = '내용을 불러올 수 없습니다', context = 'general') {
    return TextProcessor.safeText(value, fallback, context);
}

// 안전한 제목 슬라이드 생성
function createSafeTitleSlide(slide, data) {
    // 제목
    slide.addText(data.title || '회의 결과 보고서', {
        x: 1, y: 2, w: 8, h: 1.5,
        fontSize: 32,
        bold: true,
        align: 'center'
    });
    
    // 부제목
    if (data.subtitle) {
        slide.addText(data.subtitle, {
            x: 1, y: 4.2, w: 8, h: 1,
            fontSize: 18,
            align: 'center'
        });
    }
    
    // 날짜
    slide.addText(new Date().toLocaleDateString('ko-KR'), {
        x: 1, y: 6, w: 8, h: 0.5,
        fontSize: 14,
        align: 'center'
    });
}

// 안전한 안건 슬라이드 생성
function createSafeAgendaSlide(slide, data) {
    // 제목
    slide.addText(data.title || '주요 안건', {
        x: 0.5, y: 0.5, w: 9, h: 1,
        fontSize: 24,
        bold: true
    });
    
    // 안건 리스트 (최대 8개 항목만 표시)
    const content = Array.isArray(data.content) ? data.content : ['안건 정보를 불러올 수 없습니다'];
    const maxItems = Math.min(content.length, 8);
    const itemsToShow = content.slice(0, maxItems);
    
    itemsToShow.forEach((item, index) => {
        const yPos = 1.8 + (index * 0.7);
        
        // 번호
        slide.addText(`${index + 1}.`, {
            x: 1, y: yPos, w: 0.5, h: 0.6,
            fontSize: 16,
            bold: true
        });
        
        // 안건 내용
        slide.addText(safeTextForPPT(item), {
            x: 1.5, y: yPos, w: 7.5, h: 0.6,
            fontSize: 16,
            wrap: true
        });
    });
    
    // 더 많은 항목이 있다면 안내 메시지 추가
    if (content.length > maxItems) {
        slide.addText(`... 외 ${content.length - maxItems}개 안건`, {
            x: 1, y: 7.5, w: 8, h: 0.5,
            fontSize: 11,
            italic: true,
            align: 'center'
        });
    }
}

// 안전한 주제 슬라이드 생성
function createSafeTopicSlide(slide, data) {
    // 제목
    slide.addText(data.title || '논의 주제', {
        x: 0.5, y: 0.5, w: 9, h: 1,
        fontSize: 24,
        bold: true
    });
    
    let currentY = 1.8;
    
    // 섹션별 내용 (슬라이드 영역 내에서만 표시)
    if (data.sections && Array.isArray(data.sections)) {
        data.sections.forEach((section, index) => {
            // 슬라이드 영역 초과 방지 (Y 위치 7.5 이하로 제한)
            if (currentY > 7.5) {
                slide.addText(`... 더 많은 내용이 있습니다`, {
                    x: 0.5, y: 7.5, w: 9, h: 0.5,
                    fontSize: 11,
                    italic: true,
                    align: 'center'
                });
                return;
            }
            
            // 섹션 제목
            slide.addText(safeTextForPPT(section.title, `섹션 ${index + 1}`), {
                x: 0.5, y: currentY, w: 9, h: 0.6,
                fontSize: 18,
                bold: true
            });
            currentY += 0.7;
            
            // 주요 포인트 (최대 4개까지만)
            if (section.keyPoints && Array.isArray(section.keyPoints)) {
                const maxPoints = Math.min(section.keyPoints.length, 4);
                const pointsToShow = section.keyPoints.slice(0, maxPoints);
                
                pointsToShow.forEach(point => {
                    if (currentY > 7.5) return; // 영역 초과 시 중단
                    
                    slide.addText(`• ${safeTextForPPT(point)}`, {
                        x: 1, y: currentY, w: 8, h: 0.5,
                        fontSize: 14,
                        wrap: true
                    });
                    currentY += 0.5;
                });
                
                // 더 많은 포인트가 있다면 표시
                if (section.keyPoints.length > maxPoints) {
                    slide.addText(`  ... 외 ${section.keyPoints.length - maxPoints}개 포인트`, {
                        x: 1, y: currentY, w: 8, h: 0.4,
                        fontSize: 11,
                        italic: true
                    });
                    currentY += 0.4;
                }
            }
            
            currentY += 0.3; // 섹션 간격
        });
    }
}

// 안전한 결정사항 슬라이드 생성
function createSafeDecisionsSlide(slide, data) {
    // 제목
    slide.addText(data.title || '핵심 결정사항', {
        x: 0.5, y: 0.5, w: 9, h: 1,
        fontSize: 24,
        bold: true
    });
    
    const decisions = Array.isArray(data.content) ? data.content : 
                    Array.isArray(data.decisions) ? data.decisions : ['결정사항이 없습니다'];
    
    if (decisions.length === 0 || (decisions.length === 1 && decisions[0] === '결정사항이 없습니다')) {
        slide.addText('이번 회의에서는 구체적인 결정사항이 없었습니다.', {
            x: 1, y: 3, w: 8, h: 1,
            fontSize: 16,
            align: 'center'
        });
    } else {
        // 슬라이드 영역을 벗어나지 않도록 최대 4개 항목만 표시
        const maxItems = Math.min(decisions.length, 4);
        const itemsToShow = decisions.slice(0, maxItems);
        
        itemsToShow.forEach((decision, index) => {
            const yPos = 1.8 + (index * 1.5);
            
            // 결정사항 번호와 내용
            slide.addText(`결정 ${index + 1}`, {
                x: 0.5, y: yPos, w: 2, h: 0.5,
                fontSize: 16,
                bold: true
            });
            
            slide.addText(safeTextForPPT(decision, '내용을 불러올 수 없습니다', 'decision'), {
                x: 2.8, y: yPos, w: 6.7, h: 1.3,
                fontSize: 12,
                wrap: true,
                valign: 'top'
            });
        });
        
        // 더 많은 항목이 있다면 안내 메시지 추가
        if (decisions.length > maxItems) {
            slide.addText(`... 외 ${decisions.length - maxItems}개 결정사항`, {
                x: 0.5, y: 7.5, w: 9, h: 0.5,
                fontSize: 11,
                italic: true,
                align: 'center'
            });
        }
    }
}

// 안전한 액션 아이템 슬라이드 생성
function createSafeActionsSlide(slide, data) {
    // 제목
    slide.addText(data.title || '실행 계획', {
        x: 0.5, y: 0.5, w: 9, h: 1,
        fontSize: 24,
        bold: true
    });
    
    const actions = Array.isArray(data.content) ? data.content : 
                   Array.isArray(data.actions) ? data.actions : ['실행 항목이 없습니다'];
    
    if (actions.length === 0 || (actions.length === 1 && actions[0] === '실행 항목이 없습니다')) {
        slide.addText('구체적인 실행 항목이 정의되지 않았습니다.', {
            x: 1, y: 3, w: 8, h: 1,
            fontSize: 16,
            align: 'center'
        });
    } else {
        // 슬라이드 영역을 벗어나지 않도록 최대 4개 항목만 표시
        const maxItems = Math.min(actions.length, 4);
        const itemsToShow = actions.slice(0, maxItems);
        
        itemsToShow.forEach((action, index) => {
            const yPos = 1.8 + (index * 1.5);
            
            // 액션 번호
            slide.addText(`□ 액션 ${index + 1}`, {
                x: 0.5, y: yPos, w: 2, h: 0.5,
                fontSize: 16,
                bold: true
            });
            
            // 액션 내용
            slide.addText(safeTextForPPT(action, '내용을 불러올 수 없습니다', 'action'), {
                x: 2.8, y: yPos, w: 6.7, h: 1.3,
                fontSize: 12,
                wrap: true,
                valign: 'top'
            });
        });
        
        // 더 많은 항목이 있다면 안내 메시지 추가
        if (actions.length > maxItems) {
            slide.addText(`... 외 ${actions.length - maxItems}개 액션 아이템`, {
                x: 0.5, y: 7.5, w: 9, h: 0.5,
                fontSize: 11,
                italic: true,
                align: 'center'
            });
        }
    }
}

// 안전한 일반 컨텐츠 슬라이드 생성
function createSafeContentSlide(slide, data) {
    // 제목
    slide.addText(data.title || '내용', {
        x: 0.5, y: 0.5, w: 9, h: 1,
        fontSize: 24,
        bold: true
    });
    
    // 내용
    const content = Array.isArray(data.content) ? data.content.join('\n\n') : 
                   typeof data.content === 'string' ? data.content : '내용을 불러올 수 없습니다';
    
    slide.addText(content, {
        x: 0.5, y: 1.8, w: 9, h: 5,
        fontSize: 14,
        wrap: true
    });
}

// 오류 슬라이드 생성
function createErrorSlide(slide, slideTitle, contentTitle) {
    slide.addText(`❌ ${slideTitle} 생성 오류`, {
        x: 1, y: 2, w: 8, h: 1,
        fontSize: 20,
        bold: true,
        align: 'center'
    });
    
    slide.addText(`${contentTitle} 슬라이드를 생성하는 중 오류가 발생했습니다.`, {
        x: 1, y: 3.5, w: 8, h: 1,
        fontSize: 16,
        align: 'center'
    });
}

// 기본 분석 슬라이드 생성 (구조 정보가 없을 때)
function createBasicAnalyzedSlides(pptx, meetingData) {
    // 제목 슬라이드
    const titleSlide = pptx.addSlide();
    createSafeTitleSlide(titleSlide, { title: '회의 결과 보고서' });
    
    // 내용 분석 슬라이드
    const contentSlide = pptx.addSlide();
    contentSlide.addText('주요 논의 내용', {
        x: 0.5, y: 0.5, w: 9, h: 1,
        fontSize: 24,
        bold: true
    });
    
    // 회의 데이터 기본 분석
    let analysisText = '회의 내용이 충분하지 않습니다.';
    if (meetingData && meetingData.length > 100) {
        const lines = meetingData.split('\n').filter(line => line.trim().length > 20);
        const keyLines = lines.slice(0, 8).map((line, index) => `${index + 1}. ${line.substring(0, 80)}...`);
        analysisText = keyLines.join('\n\n');
    }
    
    contentSlide.addText(analysisText, {
        x: 0.5, y: 1.8, w: 9, h: 5,
        fontSize: 12,
        wrap: true
    });
    
    // 요약 슬라이드
    const summarySlide = pptx.addSlide();
    summarySlide.addText('회의 요약', {
        x: 0.5, y: 0.5, w: 9, h: 1,
        fontSize: 24,
        bold: true
    });
    
    summarySlide.addText('• 회의 일시: ' + new Date().toLocaleDateString('ko-KR'), {
        x: 1, y: 2, w: 8, h: 0.6,
        fontSize: 16
    });
    
    summarySlide.addText('• 회의 형태: 온라인 채팅 회의', {
        x: 1, y: 2.8, w: 8, h: 0.6,
        fontSize: 16
    });
    
    summarySlide.addText('• 자동 생성: AI 회의록 시스템', {
        x: 1, y: 3.6, w: 8, h: 0.6,
        fontSize: 16
    });
}

// 응급 PPT 생성 (모든 것이 실패했을 때)
function createEmergencyPPT(meetingData) {
    try {
        console.log('[응급 PPT] 생성 시도');
        
        const emergencyPptx = new PptxGenJS();
        emergencyPptx.author = 'AI';
        emergencyPptx.title = '응급 보고서';
        
        const slide = emergencyPptx.addSlide();
        slide.addText('회의 결과 (응급 버전)', {
            x: 1, y: 2, w: 8, h: 1,
            fontSize: 24,
            bold: true
        });
        
        slide.addText('PPT 생성 중 일부 오류가 발생했습니다.\n기본 정보만 포함되어 있습니다.', {
            x: 1, y: 4, w: 8, h: 2,
            fontSize: 16
        });
        
        console.log('[응급 PPT] 생성 성공');
        return emergencyPptx;
        
    } catch (error) {
        console.error('[응급 PPT] 생성도 실패:', error);
        return null;
    }
}
async function generatePptStructure(meetingData) {
    try {
        const prompt = `
# 프리미엄 PPT 제작 전문가

당신은 세계 최고 수준의 프레젠테이션 디자이너입니다. 아래 회의록을 바탕으로 **경영진 수준의 고급 PPT**를 제작하기 위한 구조화된 데이터를 생성해주세요.

## 회의록 원본
${meetingData}

## PPT 제작 지침

### 1. 슬라이드 구성 원칙
- **임팩트 우선**: 핵심 메시지가 즉시 전달되도록
- **시각적 계층**: 정보의 중요도에 따른 시각적 구분
- **스토리텔링**: 논리적 흐름으로 설득력 극대화

### 2. 출력 형식
다음 JSON 구조로 정확히 출력하세요:

\`\`\`json
{
  "title": "회의명 (간결하고 임팩트 있게)",
  "subtitle": "핵심 메시지 한 줄 요약",
  "metadata": {
    "date": "회의 일시",
    "participants": "참석자 수",
    "duration": "예상 논의 시간",
    "classification": "회의 분류 (전략/운영/프로젝트/기타)"
  },
  "slides": [
    {
      "type": "title",
      "title": "표지 제목",
      "subtitle": "부제목",
      "design": "executive"
    },
    {
      "type": "agenda",
      "title": "주요 안건",
      "content": ["안건1", "안건2", "안건3"],
      "design": "clean"
    },
    {
      "type": "topic",
      "title": "대주제명",
      "subtitle": "주제 요약 한 줄",
      "sections": [
        {
          "title": "세부주제명",
          "type": "content/table/chart",
          "background": "논의 배경",
          "keyPoints": ["핵심 포인트1", "핵심 포인트2"],
          "conclusion": "결론",
          "visual": {
            "type": "table/chart/bullet",
            "data": "시각화할 데이터"
          }
        }
      ],
      "design": "professional"
    },
    {
      "type": "decisions",
      "title": "핵심 결정사항",
      "content": [
        {
          "decision": "결정 내용",
          "priority": "high/medium/low",
          "impact": "영향도 설명"
        }
      ],
      "design": "highlight"
    },
    {
      "type": "actions",
      "title": "Action Items",
      "content": [
        {
          "action": "실행 내용",
          "owner": "담당자",
          "deadline": "완료 기한",
          "priority": "우선순위"
        }
      ],
      "design": "actionable"
    }
  ]
}
\`\`\`

### 3. 고급 기능 활용
- **표 데이터**: 3개 이상 비교 항목은 표로 변환
- **시각적 강조**: 중요 키워드는 별도 표시
- **구조화**: 우선순위/중요도별 배치 최적화

### 4. 디자인 테마
- **executive**: 최고급 경영진용 (미니멀, 고급스러움)
- **professional**: 전문적 업무용 (깔끔, 체계적)  
- **clean**: 정보 전달용 (명확, 읽기 쉬움)
- **highlight**: 강조용 (임팩트, 주목성)
- **actionable**: 실행용 (명확한 액션 유도)

중요: 반드시 유효한 JSON 형식으로만 출력하고, 추가 설명은 하지 마세요.
        `;

        const result = await apiLimiter.executeAPICall(
            async (contents, config) => await model.generateContent({
                contents: contents,
                generationConfig: config
            }),
            [{ role: 'user', parts: [{ text: prompt }] }],
            { 
                maxOutputTokens: 4000,
                temperature: 0.3
            }
        );
        
        const response = (await result.response).text().trim();
        
        // JSON 추출 (코드 블록 제거)
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            return JSON.parse(jsonStr);
        }
        
        // JSON 파싱 실패 시 기본 구조 반환
        throw new Error('JSON 파싱 실패');
        
    } catch (error) {
        console.error('[PPT 구조화 오류]:', error);
        return getDefaultPptStructure();
    }
}

function getDefaultPptStructure() {
    return {
        title: "회의 결과 보고서",
        subtitle: "주요 논의사항 및 결정사항",
        metadata: {
            date: new Date().toLocaleDateString('ko-KR'),
            participants: getParticipantNames().length + "명",
            classification: "일반"
        },
        slides: [
            {
                type: "title",
                title: "회의 결과 보고서",
                subtitle: "주요 논의사항 및 결정사항",
                design: "executive"
            },
            {
                type: "content",
                title: "회의록을 PPT로 변환 중 오류가 발생했습니다",
                content: ["회의록 내용을 직접 확인해주세요"],
                design: "clean"
            }
        ]
    };
}

async function createPowerPoint(pptStructure) {
    const pptx = new PptxGenJS();
    
    // 회사 브랜딩 설정
    pptx.author = 'AI 회의록 시스템';
    pptx.company = 'ChatApp Pro';
    pptx.subject = pptStructure.title;
    pptx.title = pptStructure.title;
    
            // 간소화된 마스터 슬라이드 설정
        pptx.defineSlideMaster({
            title: 'MASTER_SLIDE',
            objects: []  // 플레이스홀더 제거로 호환성 향상
        });

    // 슬라이드별 생성
    for (const slideData of pptStructure.slides) {
        const slide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
        
        switch (slideData.type) {
            case 'title':
                createTitleSlide(slide, slideData);
                break;
            case 'agenda':
                createAgendaSlide(slide, slideData);
                break;
            case 'topic':
                createTopicSlide(slide, slideData);
                break;
            case 'decisions':
                createDecisionsSlide(slide, slideData);
                break;
            case 'actions':
                createActionsSlide(slide, slideData);
                break;
            default:
                createContentSlide(slide, slideData);
        }
    }
    
    return pptx;
}

// 안전한 PPT 생성 함수 (완전 방어적 프로그래밍)
async function createPowerPointSafely(pptStructure) {
    let pptx = null;
    
    try {
        console.log('[PPT 안전 생성] PPT 객체 초기화 시작');
        
        // PPT 구조 검증
        if (!pptStructure) {
            throw new Error('PPT 구조가 null입니다');
        }
        
        if (!pptStructure.slides || !Array.isArray(pptStructure.slides)) {
            console.warn('[PPT 안전 생성] 슬라이드 배열이 없거나 잘못된 형식입니다. 기본 구조로 대체합니다.');
            pptStructure = getDefaultPptStructure();
        }
        
        if (pptStructure.slides.length === 0) {
            console.warn('[PPT 안전 생성] 슬라이드가 비어있습니다. 기본 슬라이드를 추가합니다.');
            pptStructure.slides.push({
                type: 'content',
                title: '회의 결과',
                content: ['회의록을 확인해 주세요.']
            });
        }
        
        // PPT 객체 생성
        pptx = new PptxGenJS();
        
        // 회사 브랜딩 설정 (안전한 기본값 사용)
        pptx.author = 'AI 회의록 시스템';
        pptx.company = 'ChatApp Pro';
        pptx.subject = String(pptStructure.title || '회의 결과 보고서');
        pptx.title = String(pptStructure.title || '회의 결과 보고서');
        
        console.log('[PPT 안전 생성] PPT 객체 초기화 완료');
        
        // 마스터 슬라이드 설정 (최대한 안전하게, 필수 아님)
        let useMasterSlide = false;
        try {
            pptx.defineSlideMaster({
                title: 'MASTER_SLIDE',
                objects: []  // 간소화된 설정
            });
            useMasterSlide = true;
            console.log('[PPT 안전 생성] 마스터 슬라이드 설정 완료');
        } catch (masterError) {
            console.warn('[PPT 안전 생성] 마스터 슬라이드 설정 건너뜀:', masterError.message);
            useMasterSlide = false;
            // 마스터 슬라이드 없이 진행 (더 안전)
        }

        // 슬라이드별 안전한 생성
        console.log(`[PPT 안전 생성] ${pptStructure.slides.length}개 슬라이드 생성 시작`);
        
        for (let i = 0; i < pptStructure.slides.length; i++) {
            const slideData = pptStructure.slides[i];
            
            try {
                console.log(`[PPT 안전 생성] 슬라이드 ${i + 1} 생성 중 (${slideData.type})`);
                
                // 마스터 슬라이드 사용 여부에 따라 슬라이드 생성
                const slide = useMasterSlide ? 
                    pptx.addSlide({ masterName: 'MASTER_SLIDE' }) : 
                    pptx.addSlide();
                
                // 슬라이드 타입별 안전한 생성
                switch (slideData.type) {
                    case 'title':
                        createTitleSlideSafely(slide, slideData, i);
                        break;
                    case 'agenda':
                        createAgendaSlideSafely(slide, slideData, i);
                        break;
                    case 'topic':
                        createTopicSlideSafely(slide, slideData, i);
                        break;
                    case 'decisions':
                        createDecisionsSlideSafely(slide, slideData, i);
                        break;
                    case 'actions':
                        createActionsSlideSafely(slide, slideData, i);
                        break;
                    default:
                        createContentSlideSafely(slide, slideData, i);
                }
                
                console.log(`[PPT 안전 생성] 슬라이드 ${i + 1} 생성 완료`);
                
            } catch (slideError) {
                console.error(`[PPT 안전 생성] 슬라이드 ${i + 1} 생성 실패:`, slideError);
                
                // 폴백: 오류 슬라이드 생성
                try {
                    const errorSlide = useMasterSlide ? 
                        pptx.addSlide({ masterName: 'MASTER_SLIDE' }) : 
                        pptx.addSlide();
                    errorSlide.addText(`슬라이드 ${i + 1} 생성 오류`, safeSlideOptions({
                        x: 1, y: 2, w: 8, h: 1,
                        fontSize: 18,
                        color: 'D32F2F',
                        fontFace: 'Segoe UI'
                    }));
                    errorSlide.addText('이 슬라이드는 생성 중 오류가 발생했습니다.', safeSlideOptions({
                        x: 1, y: 3.5, w: 8, h: 0.5,
                        fontSize: 14,
                        color: '666666',
                        fontFace: 'Segoe UI'
                    }));
                } catch (fallbackError) {
                    console.error(`[PPT 안전 생성] 폴백 슬라이드 생성도 실패:`, fallbackError);
                }
            }
        }
        
        console.log('[PPT 안전 생성] 모든 슬라이드 생성 완료');
        return pptx;
        
            } catch (error) {
            console.error('[PPT 안전 생성] 치명적 오류:', error);
            
            // 최종 폴백: 극도로 단순한 PPT 생성
            try {
                console.log('[PPT 안전 생성] 최종 폴백 PPT 생성 시도');
                
                const fallbackPptx = new PptxGenJS();
                fallbackPptx.author = 'AI 회의록 시스템';
                fallbackPptx.title = '회의 결과 보고서';
                
                // 극도로 단순한 슬라이드 (복잡한 옵션 일체 없음)
                const fallbackSlide = fallbackPptx.addSlide();
                
                // 최소한의 텍스트만 추가
                fallbackSlide.addText('회의 결과 보고서', {
                    x: 1, y: 2, w: 8, h: 1,
                    fontSize: 24,
                    bold: true,
                    color: '333333'
                });
                
                fallbackSlide.addText('PPT 생성 중 오류가 발생했습니다.', {
                    x: 1, y: 3.5, w: 8, h: 1,
                    fontSize: 16,
                    color: '666666'
                });
                
                fallbackSlide.addText('회의록을 확인해 주세요.', {
                    x: 1, y: 4.5, w: 8, h: 1,
                    fontSize: 16,
                    color: '666666'
                });
                
                console.log('[PPT 안전 생성] 최종 폴백 PPT 생성 성공');
                return fallbackPptx;
                
            } catch (fallbackError) {
                console.error('[PPT 안전 생성] 최종 폴백도 실패:', fallbackError);
                
                // 궁극의 폴백: 빈 PPT라도 생성
                try {
                    const emptyPptx = new PptxGenJS();
                    emptyPptx.author = 'AI 회의록 시스템';
                    emptyPptx.title = '오류 발생';
                    
                    const emptySlide = emptyPptx.addSlide();
                    emptySlide.addText('오류', { x: 1, y: 3, w: 8, h: 1 });
                    
                    console.log('[PPT 안전 생성] 궁극 폴백 성공');
                    return emptyPptx;
                } catch (ultimateError) {
                    console.error('[PPT 안전 생성] 모든 폴백 실패:', ultimateError);
                    return null;
                }
            }
        }
}

// 안전한 슬라이드 생성 함수들
function createTitleSlideSafely(slide, data, index) {
    try {
        createTitleSlide(slide, data);
    } catch (error) {
        console.error(`[제목 슬라이드 ${index + 1} 오류]:`, error);
        createFallbackSlide(slide, '제목 슬라이드', `슬라이드 ${index + 1}: 제목 슬라이드 생성 중 오류가 발생했습니다.`);
    }
}

function createAgendaSlideSafely(slide, data, index) {
    try {
        createAgendaSlide(slide, data);
    } catch (error) {
        console.error(`[안건 슬라이드 ${index + 1} 오류]:`, error);
        createFallbackSlide(slide, '주요 안건', `슬라이드 ${index + 1}: 안건 슬라이드 생성 중 오류가 발생했습니다.`);
    }
}

function createTopicSlideSafely(slide, data, index) {
    try {
        createTopicSlide(slide, data);
    } catch (error) {
        console.error(`[주제 슬라이드 ${index + 1} 오류]:`, error);
        createFallbackSlide(slide, '주제 슬라이드', `슬라이드 ${index + 1}: 주제 슬라이드 생성 중 오류가 발생했습니다.`);
    }
}

function createDecisionsSlideSafely(slide, data, index) {
    try {
        createDecisionsSlide(slide, data);
    } catch (error) {
        console.error(`[결정사항 슬라이드 ${index + 1} 오류]:`, error);
        createFallbackSlide(slide, '핵심 결정사항', `슬라이드 ${index + 1}: 결정사항 슬라이드 생성 중 오류가 발생했습니다.`);
    }
}

function createActionsSlideSafely(slide, data, index) {
    try {
        createActionsSlide(slide, data);
    } catch (error) {
        console.error(`[액션 슬라이드 ${index + 1} 오류]:`, error);
        createFallbackSlide(slide, 'Action Items', `슬라이드 ${index + 1}: 액션 아이템 슬라이드 생성 중 오류가 발생했습니다.`);
    }
}

function createContentSlideSafely(slide, data, index) {
    try {
        createContentSlide(slide, data);
    } catch (error) {
        console.error(`[콘텐츠 슬라이드 ${index + 1} 오류]:`, error);
        createFallbackSlide(slide, '내용', `슬라이드 ${index + 1}: 콘텐츠 슬라이드 생성 중 오류가 발생했습니다.`);
    }
}

// 폴백 슬라이드 생성 함수
function createFallbackSlide(slide, title, message) {
    try {
        slide.addText(title, safeSlideOptions({
            x: 1, y: 1.5, w: 8, h: 1,
            fontSize: 24,
            bold: true,
            color: 'D32F2F',
            fontFace: 'Segoe UI'
        }));
        
        slide.addText(message, safeSlideOptions({
            x: 1, y: 3, w: 8, h: 2,
            fontSize: 16,
            color: '666666',
            fontFace: 'Segoe UI',
            valign: 'top'
        }));
        
        slide.addText('회의록을 직접 확인해 주세요.', safeSlideOptions({
            x: 1, y: 5.5, w: 8, h: 0.5,
            fontSize: 14,
            color: '999999',
            fontFace: 'Segoe UI',
            align: 'center'
        }));
    } catch (fallbackError) {
        console.error('[폴백 슬라이드 생성 오류]:', fallbackError);
        // 최소한의 텍스트라도 추가 시도
        try {
            slide.addText('오류 발생', safeSlideOptions({
                x: 1, y: 3, w: 8, h: 1,
                fontSize: 18,
                color: '333333',
                fontFace: 'Arial'
            }));
        } catch (minimalError) {
            console.error('[최소 폴백도 실패]:', minimalError);
        }
    }
}

function createTitleSlide(slide, data) {
    try {
        // 🎨 단순한 배경 (그라데이션 제거, 안전성 우선)
        try {
            slide.background = { fill: '4472C4' }; // 단순 문자열 색상
        } catch (bgError) {
            console.warn('[배경 설정 실패]:', bgError.message);
            // 배경 없이 진행
        }
        
        // 📝 메인 제목 - 단순하고 안전하게
        const mainTitle = data.title || '회의 결과 보고서';
        slide.addText(mainTitle, safeSlideOptions({
            x: 0.5, y: 2, w: 9, h: 1.8,
            fontSize: 44,
            bold: true,
            color: 'FFFFFF',
            align: 'center',
            fontFace: 'Segoe UI'
            // shadow 제거 (색상 오류 방지)
        }));
        
        // 📄 부제목 - 더 명확한 설명
        const subtitle = data.subtitle || '핵심 논의사항, 결정사항 및 액션 플랜';
        slide.addText(subtitle, safeSlideOptions({
            x: 1, y: 4.2, w: 8, h: 1,
            fontSize: 20,
            color: 'F0F8FF',
            align: 'center',
            fontFace: 'Segoe UI Light'
        }));
        
        // 🗓️ 날짜 및 메타 정보
        const today = new Date();
        const dateStr = today.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long', 
            day: 'numeric'
        });
        
        slide.addText(`${dateStr} 생성`, safeSlideOptions({
            x: 6.5, y: 6.8, w: 2.5, h: 0.4,
            fontSize: 12,
            color: 'E6F3FF',
            align: 'right',
            fontFace: 'Segoe UI'
        }));
        
        // 🏢 회사/팀 로고 영역 (텍스트로 대체)
        slide.addText('Neural Café', safeSlideOptions({
            x: 0.5, y: 6.8, w: 2.5, h: 0.4,
            fontSize: 12,
            color: 'E6F3FF',
            align: 'left',
            fontFace: 'Segoe UI',
            italic: true
        }));
        
        // ✨ 장식적 요소 - 단순한 라인 (색상 오류 방지)
        try {
            slide.addShape('rect', {
                x: 2, y: 5.5, w: 6, h: 0.05,
                fill: 'FFFFFF'
                // transparency 제거 (호환성 문제 가능성)
            });
        } catch (shapeError) {
            console.warn('[장식 요소 생성 실패]:', shapeError.message);
            // 장식 없이 진행
        }
        
    } catch (error) {
        console.error('[제목 슬라이드 생성 오류]:', error);
        // 폴백: 깔끔한 기본 제목 슬라이드
        slide.addText('회의 결과 보고서', safeSlideOptions({
            x: 1, y: 3, w: 8, h: 1.5,
            fontSize: 32,
            bold: true,
            color: '2E4F8C',
            align: 'center',
            fontFace: 'Segoe UI'
        }));
        
        slide.addText('주요 내용 및 결정사항', safeSlideOptions({
            x: 1, y: 4.5, w: 8, h: 0.8,
            fontSize: 16,
            color: '5A6C7D',
            align: 'center',
            fontFace: 'Segoe UI Light'
        }));
    }
}

function createAgendaSlide(slide, data) {
    try {
        // 🎯 헤더 섹션 - 목적이 명확한 제목
        slide.addText('📋 회의 안건 개요', safeSlideOptions({
            x: 0.5, y: 0.3, w: 9, h: 0.8,
            fontSize: 32,
            bold: true,
            color: '2E4F8C',
            fontFace: 'Segoe UI'
        }));
        
        // 📝 부제목 - 슬라이드 목적 설명
        slide.addText('오늘 회의에서 다뤄진 핵심 주제들', safeSlideOptions({
            x: 0.5, y: 1.1, w: 9, h: 0.5,
            fontSize: 16,
            color: '6C7B8A',
            fontFace: 'Segoe UI Light'
        }));
        
        // 🎨 구분선 (단순화)
        try {
            slide.addShape('rect', {
                x: 0.5, y: 1.8, w: 9, h: 0.03,
                fill: '4472C4'
            });
        } catch (shapeError) {
            console.warn('[구분선 생성 실패]:', shapeError.message);
        }
        
        // 📌 안건 리스트 - 더 체계적으로
        const contentArray = Array.isArray(data.content) ? data.content : ['안건 정보를 불러올 수 없습니다'];
        
        contentArray.forEach((item, index) => {
            const yPos = 2.3 + (index * 0.9);
            
            // 🔢 번호 배지 (단순화)
            try {
                slide.addShape('rect', {
                    x: 0.7, y: yPos - 0.1, w: 0.6, h: 0.6,
                    fill: '4472C4'
                    // line 속성 제거 (색상 오류 방지)
                });
                
                slide.addText(`${index + 1}`, {
                    x: 0.8, y: yPos, w: 0.4, h: 0.4,
                    fontSize: 16,
                    bold: true,
                    color: 'FFFFFF',
                    align: 'center',
                    fontFace: 'Segoe UI'
                });
            } catch (badgeError) {
                console.warn('[번호 배지 생성 실패]:', badgeError.message);
            }
            
            // 📄 안건 내용
            slide.addText(item, safeSlideOptions({
                x: 1.5, y: yPos, w: 7.5, h: 0.7,
                fontSize: 18,
                color: '2D3748',
                fontFace: 'Segoe UI',
                valign: 'middle'
            }));
            
            // ✨ 미묘한 구분선 (마지막 항목 제외)
            if (index < contentArray.length - 1) {
                try {
                    slide.addShape('rect', {
                        x: 1.5, y: yPos + 0.7, w: 7.5, h: 0.01,
                        fill: 'E2E8F0'
                    });
                } catch (lineError) {
                    console.warn('[구분선 생성 실패]:', lineError.message);
                }
            }
        });
        
        // 📊 안건 수 요약
        if (contentArray.length > 1) {
            slide.addText(`총 ${contentArray.length}개 안건`, safeSlideOptions({
                x: 7.5, y: 6.5, w: 2, h: 0.4,
                fontSize: 12,
                color: '718096',
                align: 'right',
                fontFace: 'Segoe UI',
                italic: true
            }));
        }
        
    } catch (error) {
        console.error('[안건 슬라이드 생성 오류]:', error);
        slide.addText('❌ 안건 정보 로드 실패', safeSlideOptions({
            x: 1, y: 3, w: 8, h: 1,
            fontSize: 20,
            color: 'E53E3E',
            align: 'center',
            fontFace: 'Segoe UI'
        }));
        
        slide.addText('회의록을 다시 확인해주세요', safeSlideOptions({
            x: 1, y: 4, w: 8, h: 0.6,
            fontSize: 14,
            color: '718096',
            align: 'center',
            fontFace: 'Segoe UI Light'
        }));
    }
}

function createTopicSlide(slide, data) {
    try {
        // 제목
        slide.addText(data.title || '주제', safeSlideOptions({
            x: 0.5, y: 0.3, w: 9, h: 0.8,
            fontSize: 24,
            bold: true,
            color: '4472C4',
            fontFace: 'Segoe UI'
        }));
        
        // 부제목
        if (data.subtitle) {
            slide.addText(data.subtitle, safeSlideOptions({
                x: 0.5, y: 1, w: 9, h: 0.5,
                fontSize: 14,
                color: '666666',
                fontFace: 'Segoe UI'
            }));
        }
        
        let currentY = 1.8;
        
        // 섹션별 내용
        const sections = Array.isArray(data.sections) ? data.sections : [];
        sections.forEach((section, index) => {
            try {
                // 섹션 제목
                slide.addText(section.title || `섹션 ${index + 1}`, safeSlideOptions({
                    x: 0.5, y: currentY, w: 9, h: 0.6,
                    fontSize: 18,
                    bold: true,
                    color: '333333',
                    fontFace: 'Segoe UI'
                }));
                currentY += 0.7;
                
                // 배경 정보
                if (section.background) {
                    slide.addText(`배경: ${section.background}`, safeSlideOptions({
                        x: 0.7, y: currentY, w: 8.5, h: 0.4,
                        fontSize: 12,
                        color: '666666',
                        fontFace: 'Segoe UI'
                    }));
                    currentY += 0.5;
                }
                
                // 핵심 포인트
                if (section.keyPoints && Array.isArray(section.keyPoints) && section.keyPoints.length > 0) {
                    section.keyPoints.forEach(point => {
                        if (point && typeof point === 'string') {
                            slide.addText(`• ${point}`, safeSlideOptions({
                                x: 0.7, y: currentY, w: 8.5, h: 0.4,
                                fontSize: 14,
                                color: '333333',
                                fontFace: 'Segoe UI'
                            }));
                            currentY += 0.4;
                        }
                    });
                }
                
                // 표나 차트가 있는 경우 (강화된 오류 처리)
                if (section.visual?.type === 'table' && section.visual.data) {
                    console.log(`[테이블 처리 시작] 섹션: ${section.title}, 데이터:`, section.visual.data);
                    createTableInSlide(slide, section.visual.data, currentY);
                    currentY += 2; // 표 공간 확보
                }
                
                // 결론
                if (section.conclusion) {
                    slide.addText(`결론: ${section.conclusion}`, safeSlideOptions({
                        x: 0.7, y: currentY, w: 8.5, h: 0.4,
                        fontSize: 14,
                        bold: true,
                        color: '2E7D32',
                        fontFace: 'Segoe UI'
                    }));
                    currentY += 0.6;
                }
                
                currentY += 0.3; // 섹션 간 간격
                
            } catch (sectionError) {
                console.error(`[섹션 ${index + 1} 처리 오류]:`, sectionError);
                slide.addText(`⚠️ 섹션 ${index + 1} 처리 중 오류 발생`, safeSlideOptions({
                    x: 0.7, y: currentY, w: 8.5, h: 0.4,
                    fontSize: 12,
                    color: 'D32F2F',
                    fontFace: 'Segoe UI'
                }));
                currentY += 0.6;
            }
        });
        
    } catch (error) {
        console.error('[주제 슬라이드 생성 오류]:', error);
        slide.addText('주제 슬라이드 생성 중 오류가 발생했습니다', safeSlideOptions({
            x: 1, y: 2, w: 8, h: 1,
            fontSize: 16,
            color: 'D32F2F',
            fontFace: 'Segoe UI'
        }));
    }
}

function createDecisionsSlide(slide, data) {
    try {
        // 🎯 임팩트 있는 헤더
        slide.addText('💡 핵심 결정사항', safeSlideOptions({
            x: 0.5, y: 0.3, w: 9, h: 0.8,
            fontSize: 32,
            bold: true,
            color: 'C53030',
            fontFace: 'Segoe UI'
        }));
        
        // 📋 슬라이드 목적 설명
        slide.addText('회의를 통해 확정된 주요 의사결정 내용', safeSlideOptions({
            x: 0.5, y: 1.1, w: 9, h: 0.5,
            fontSize: 16,
            color: '6C7B8A',
            fontFace: 'Segoe UI Light'
        }));
        
        // 🎨 강조 구분선
        slide.addShape('rect', safeSlideOptions({
            x: 0.5, y: 1.8, w: 9, h: 0.05,
            fill: 'C53030'
        }));
        
        // 📊 결정사항 리스트 - 카드 형태로
        const decisions = Array.isArray(data.content) ? data.content : [];
        
        if (decisions.length > 0) {
            decisions.forEach((decision, index) => {
                try {
                    const yPos = 2.4 + (index * 1.3);
                    
                    // 🎨 우선순위별 색상 매핑
                    const priorityConfig = {
                        'high': { color: 'E53E3E', icon: '🔴', label: '높음' },
                        'medium': { color: 'F56500', icon: '🟡', label: '보통' },
                        'low': { color: '38A169', icon: '🟢', label: '낮음' }
                    };
                    
                    const priority = decision.priority || 'medium';
                    const config = priorityConfig[priority] || priorityConfig['medium'];
                    
                    // 📦 결정사항 카드 배경
                    slide.addShape('rect', safeSlideOptions({
                        x: 0.5, y: yPos - 0.1, w: 9, h: 1.1,
                        fill: 'F7FAFC',
                        line: { color: 'E2E8F0', width: 1 }
                    }));
                    
                    // 🏷️ 우선순위 배지
                    slide.addShape('rect', safeSlideOptions({
                        x: 8.5, y: yPos, w: 0.8, h: 0.3,
                        fill: config.color
                    }));
                    
                    slide.addText(config.label, safeSlideOptions({
                        x: 8.5, y: yPos, w: 0.8, h: 0.3,
                        fontSize: 10,
                        bold: true,
                        color: 'FFFFFF',
                        align: 'center',
                        valign: 'middle',
                        fontFace: 'Segoe UI'
                    }));
                    
                    // 📄 결정사항 제목
                    slide.addText(`${config.icon} ${decision.decision || '결정사항 없음'}`, safeSlideOptions({
                        x: 0.8, y: yPos, w: 7.5, h: 0.5,
                        fontSize: 16,
                        bold: true,
                        color: '2D3748',
                        fontFace: 'Segoe UI'
                    }));
                    
                    // 📈 영향도 설명
                    if (decision.impact) {
                        slide.addText(`영향도: ${decision.impact}`, safeSlideOptions({
                            x: 0.8, y: yPos + 0.5, w: 7.5, h: 0.4,
                            fontSize: 12,
                            color: '4A5568',
                            fontFace: 'Segoe UI'
                        }));
                    }
                    
                    // 📅 담당자/기한 정보 (있다면)
                    if (decision.owner || decision.deadline) {
                        const additionalInfo = [];
                        if (decision.owner) additionalInfo.push(`담당: ${decision.owner}`);
                        if (decision.deadline) additionalInfo.push(`기한: ${decision.deadline}`);
                        
                        slide.addText(additionalInfo.join(' | '), safeSlideOptions({
                            x: 0.8, y: yPos + 0.8, w: 7.5, h: 0.3,
                            fontSize: 10,
                            color: '718096',
                            fontFace: 'Segoe UI',
                            italic: true
                        }));
                    }
                    
                } catch (decisionError) {
                    console.error(`[결정사항 ${index + 1} 처리 오류]:`, decisionError);
                }
            });
            
            // 📊 요약 정보
            slide.addText(`총 ${decisions.length}개 결정사항 확정`, safeSlideOptions({
                x: 7, y: 6.5, w: 2.5, h: 0.4,
                fontSize: 12,
                color: 'C53030',
                align: 'right',
                fontFace: 'Segoe UI',
                bold: true
            }));
            
        } else {
            // 🤷 결정사항 없음 표시
            slide.addShape('rect', safeSlideOptions({
                x: 2, y: 3, w: 6, h: 2,
                fill: 'FFF5F5',
                line: { color: 'FED7D7', width: 1 }
            }));
            
            slide.addText('📝 이번 회의에서는\n구체적인 결정사항이 없었습니다', safeSlideOptions({
                x: 2.5, y: 3.5, w: 5, h: 1,
                fontSize: 16,
                color: '9B2C2C',
                align: 'center',
                valign: 'middle',
                fontFace: 'Segoe UI'
            }));
        }
        
    } catch (error) {
        console.error('[결정사항 슬라이드 생성 오류]:', error);
        slide.addText('❌ 결정사항 정보 로드 실패', safeSlideOptions({
            x: 1, y: 3, w: 8, h: 1,
            fontSize: 20,
            color: 'E53E3E',
            align: 'center',
            fontFace: 'Segoe UI'
        }));
        
        slide.addText('회의록을 다시 확인해주세요', safeSlideOptions({
            x: 1, y: 4, w: 8, h: 0.6,
            fontSize: 14,
            color: '718096',
            align: 'center',
            fontFace: 'Segoe UI Light'
        }));
    }
}

function createActionsSlide(slide, data) {
    try {
        // ⚡ 동적인 헤더
        slide.addText('⚡ Action Items', safeSlideOptions({
            x: 0.5, y: 0.3, w: 9, h: 0.8,
            fontSize: 32,
            bold: true,
            color: '1565C0',
            fontFace: 'Segoe UI'
        }));
        
        // 📋 명확한 목적 설명
        slide.addText('회의 결과 실행해야 할 구체적인 후속 조치', safeSlideOptions({
            x: 0.5, y: 1.1, w: 9, h: 0.5,
            fontSize: 16,
            color: '6C7B8A',
            fontFace: 'Segoe UI Light'
        }));
        
        // 🎨 액션 구분선
        slide.addShape('rect', safeSlideOptions({
            x: 0.5, y: 1.8, w: 9, h: 0.05,
            fill: '1565C0'
        }));
        
        // 📊 액션 아이템 처리
        const actions = Array.isArray(data.content) ? data.content : [];
        
        if (actions.length > 0) {
            try {
                // 🎯 우선순위별 분류
                const priorityGroups = {
                    high: { items: [], color: 'E53E3E', icon: '🔥', label: '긴급' },
                    medium: { items: [], color: 'F56500', icon: '⚡', label: '보통' },
                    low: { items: [], color: '38A169', icon: '📋', label: '일반' }
                };
                
                actions.forEach(action => {
                    const priority = action.priority || 'medium';
                    if (priorityGroups[priority]) {
                        priorityGroups[priority].items.push(action);
                    } else {
                        priorityGroups.medium.items.push(action);
                    }
                });
                
                let currentY = 2.3;
                
                // 우선순위별로 표시
                Object.entries(priorityGroups).forEach(([priority, group]) => {
                    if (group.items.length > 0) {
                        // 🏷️ 우선순위 섹션 헤더
                        slide.addText(`${group.icon} ${group.label} (${group.items.length}개)`, safeSlideOptions({
                            x: 0.5, y: currentY, w: 9, h: 0.4,
                            fontSize: 14,
                            bold: true,
                            color: group.color,
                            fontFace: 'Segoe UI'
                        }));
                        currentY += 0.5;
                        
                        // 📝 각 액션 아이템
                        group.items.forEach((action, index) => {
                            // 📦 액션 카드 배경
                            slide.addShape('rect', safeSlideOptions({
                                x: 0.5, y: currentY - 0.05, w: 9, h: 0.8,
                                fill: priority === 'high' ? 'FFF5F5' : (priority === 'medium' ? 'FFFAF0' : 'F0FFF4'),
                                line: { color: group.color, width: 1 }
                            }));
                            
                            // ✅ 체크박스
                            slide.addShape('rect', safeSlideOptions({
                                x: 0.7, y: currentY + 0.1, w: 0.3, h: 0.3,
                                fill: 'FFFFFF',
                                line: { color: group.color, width: 2 }
                            }));
                            
                            // 📄 액션 내용
                            slide.addText(action.action || '액션 없음', safeSlideOptions({
                                x: 1.2, y: currentY, w: 5, h: 0.4,
                                fontSize: 14,
                                bold: true,
                                color: '2D3748',
                                fontFace: 'Segoe UI'
                            }));
                            
                            // 👤 담당자
                            if (action.owner) {
                                slide.addText(`👤 ${action.owner}`, safeSlideOptions({
                                    x: 6.5, y: currentY, w: 1.5, h: 0.4,
                                    fontSize: 11,
                                    color: '4A5568',
                                    fontFace: 'Segoe UI'
                                }));
                            }
                            
                            // 📅 기한
                            if (action.deadline) {
                                slide.addText(`📅 ${action.deadline}`, safeSlideOptions({
                                    x: 8.2, y: currentY, w: 1.3, h: 0.4,
                                    fontSize: 11,
                                    color: '4A5568',
                                    fontFace: 'Segoe UI'
                                }));
                            }
                            
                            // 📝 추가 설명 (있다면)
                            if (action.description) {
                                slide.addText(action.description, safeSlideOptions({
                                    x: 1.2, y: currentY + 0.4, w: 7.5, h: 0.3,
                                    fontSize: 10,
                                    color: '718096',
                                    fontFace: 'Segoe UI',
                                    italic: true
                                }));
                            }
                            
                            currentY += 0.9;
                        });
                        
                        currentY += 0.2; // 그룹 간 간격
                    }
                });
                
                // 📊 액션 요약
                slide.addText(`총 ${actions.length}개 액션 아이템`, safeSlideOptions({
                    x: 7, y: 6.5, w: 2.5, h: 0.4,
                    fontSize: 12,
                    color: '1565C0',
                    align: 'right',
                    fontFace: 'Segoe UI',
                    bold: true
                }));
                
                console.log(`[액션 아이템 생성 성공] ${actions.length}개 아이템`);
                
            } catch (actionError) {
                console.error('[액션 아이템 처리 오류]:', actionError);
                
                // 🔄 단순 리스트 폴백
                slide.addText('📝 액션 아이템 목록', safeSlideOptions({
                    x: 0.5, y: 2.3, w: 9, h: 0.5,
                    fontSize: 16,
                    bold: true,
                    color: '2D3748',
                    fontFace: 'Segoe UI'
                }));
                
                actions.forEach((action, index) => {
                    slide.addText(`${index + 1}. ${action.action || '액션 없음'} (담당: ${action.owner || '미정'})`, safeSlideOptions({
                        x: 0.7, y: 3 + (index * 0.5), w: 8.5, h: 0.4,
                        fontSize: 12,
                        color: '4A5568',
                        fontFace: 'Segoe UI'
                    }));
                });
            }
        } else {
            // 📭 액션 아이템 없음
            slide.addShape('rect', safeSlideOptions({
                x: 2, y: 3, w: 6, h: 2,
                fill: 'F0F9FF',
                line: { color: 'BEE3F8', width: 1 }
            }));
            
            slide.addText('📭 실행할 액션 아이템이\n아직 등록되지 않았습니다', safeSlideOptions({
                x: 2.5, y: 3.5, w: 5, h: 1,
                fontSize: 16,
                color: '2B6CB0',
                align: 'center',
                valign: 'middle',
                fontFace: 'Segoe UI'
            }));
        }
        
    } catch (error) {
        console.error('[액션 슬라이드 생성 오류]:', error);
        slide.addText('❌ 액션 아이템 정보 로드 실패', safeSlideOptions({
            x: 1, y: 3, w: 8, h: 1,
            fontSize: 20,
            color: 'E53E3E',
            align: 'center',
            fontFace: 'Segoe UI'
        }));
        
        slide.addText('회의록을 다시 확인해주세요', safeSlideOptions({
            x: 1, y: 4, w: 8, h: 0.6,
            fontSize: 14,
            color: '718096',
            align: 'center',
            fontFace: 'Segoe UI Light'
        }));
    }
}

function createContentSlide(slide, data) {
    try {
        // 제목
        slide.addText(data.title || '내용', safeSlideOptions({
            x: 0.5, y: 0.5, w: 9, h: 1,
            fontSize: 24,
            bold: true,
            color: '4472C4',
            fontFace: 'Segoe UI'
        }));
        
        // 내용
        if (Array.isArray(data.content)) {
            data.content.forEach((item, index) => {
                if (item && typeof item === 'string') {
                    slide.addText(`• ${item}`, safeSlideOptions({
                        x: 0.7, y: 2 + (index * 0.6), w: 8.5, h: 0.5,
                        fontSize: 16,
                        color: '333333',
                        fontFace: 'Segoe UI'
                    }));
                }
            });
        } else if (data.content) {
            slide.addText(String(data.content), safeSlideOptions({
                x: 0.5, y: 2, w: 9, h: 4,
                fontSize: 16,
                color: '333333',
                fontFace: 'Segoe UI',
                valign: 'top'
            }));
        } else {
            slide.addText('내용이 없습니다.', safeSlideOptions({
                x: 1, y: 2.5, w: 8, h: 0.6,
                fontSize: 16,
                color: '666666',
                fontFace: 'Segoe UI',
                align: 'center'
            }));
        }
        
    } catch (error) {
        console.error('[콘텐츠 슬라이드 생성 오류]:', error);
        slide.addText('콘텐츠를 불러올 수 없습니다', safeSlideOptions({
            x: 1, y: 2, w: 8, h: 1,
            fontSize: 16,
            color: '333333',
            fontFace: 'Segoe UI'
        }));
    }
}

function createTableInSlide(slide, tableData, yPosition) {
    if (!tableData) return;
    
    try {
        // 테이블 데이터 정규화 및 검증
        let normalizedTableData = normalizeTableData(tableData);
        
        if (!Array.isArray(normalizedTableData) || normalizedTableData.length === 0) {
            console.log('[테이블 생성 경고] 유효하지 않은 테이블 데이터:', tableData);
            return;
        }
        
        // 각 행이 배열인지 확인하고 수정
        normalizedTableData = normalizedTableData.map(row => {
            if (Array.isArray(row)) {
                return row.map(cell => String(cell || ''));
            } else if (typeof row === 'object' && row !== null) {
                return Object.values(row).map(cell => String(cell || ''));
            } else {
                return [String(row || '')];
            }
        });
        
        // 최소 1개 행이 있는지 확인
        if (normalizedTableData.length === 0) {
            console.log('[테이블 생성 경고] 빈 테이블 데이터');
            return;
        }
        
        // 최대한 단순한 테이블 옵션 (PptxGenJS 안전성 최우선)
        const safeTableOptions = {
            x: 0.5, 
            y: yPosition, 
            w: 9, 
            fontSize: 11,
            fontFace: 'Segoe UI',
            fill: 'F8F9FA',  // 단순 문자열
            color: '333333', // 단순 문자열
            margin: 0.1,
            valign: 'middle',
            align: 'left'
            // border, shadow 등 복잡한 속성은 모두 제거
        };
        
        slide.addTable(normalizedTableData, safeTableOptions);
        
        console.log(`[테이블 생성 성공] ${normalizedTableData.length}행 테이블 생성됨`);
        
    } catch (error) {
        console.error('[테이블 생성 오류]:', error);
        console.log('[원본 테이블 데이터]:', tableData);
        
        // 폴백 1: 최소한의 옵션으로 테이블 재시도
        try {
            console.log('[테이블 폴백 1] 최소 옵션으로 테이블 재생성 시도');
            const fallbackOptions = {
                x: 0.5,
                y: yPosition,
                w: 9
            };
            slide.addTable(normalizedTableData, fallbackOptions);
            console.log('[테이블 폴백 1 성공] 최소 옵션으로 테이블 생성됨');
            return;
        } catch (fallbackError) {
            console.error('[테이블 폴백 1 실패]:', fallbackError);
        }
        
        // 폴백 2: 간단한 텍스트로 표시
        try {
            const textContent = normalizedTableData.map(row => 
                Array.isArray(row) ? row.join(' | ') : String(row)
            ).join('\n');
            
            slide.addText(`📊 테이블 데이터:\n${textContent}`, {
                x: 0.5, 
                y: yPosition, 
                w: 9, 
                h: Math.min(3, 0.5 + normalizedTableData.length * 0.2),
                fontSize: 10,
                color: '333333',
                fontFace: 'Segoe UI',
                fill: 'F8F9FA',
                wrap: true
            });
            console.log('[테이블 폴백 2 성공] 텍스트 형태로 표시됨');
        } catch (textError) {
            console.error('[테이블 폴백 2 실패]:', textError);
            
            // 최종 폴백: 오류 메시지만 표시
            slide.addText('⚠️ 테이블 데이터 처리 중 오류가 발생했습니다.', {
                x: 0.5, 
                y: yPosition, 
                w: 9, 
                h: 0.5,
                fontSize: 12,
                color: 'D32F2F',
                fontFace: 'Segoe UI'
            });
        }
    }
}

// 색상 값 안전 처리 함수 (극강화 버전)
// 간소화된 슬라이드 옵션 처리 (색상 제거)
function safeSlideOptions(options) {
    // 색상 관련 속성 제거하고 기본 옵션만 반환
    if (!options || typeof options !== 'object') {
        return {};
    }
    
    const cleaned = { ...options };
    // 색상 관련 속성들 제거
    delete cleaned.color;
    delete cleaned.fill;
    delete cleaned.background;
    delete cleaned.border;
    
    return cleaned;
}

// 테이블 데이터 정규화 함수
function normalizeTableData(rawData) {
    if (!rawData) return [];
    
    // 이미 배열인 경우
    if (Array.isArray(rawData)) {
        return rawData;
    }
    
    // 문자열인 경우 파싱 시도
    if (typeof rawData === 'string') {
        try {
            // JSON 문자열일 가능성
            const parsed = JSON.parse(rawData);
            if (Array.isArray(parsed)) return parsed;
            
            // CSV 형태 문자열일 가능성  
            const lines = rawData.split('\n').filter(line => line.trim());
            return lines.map(line => line.split(',').map(cell => cell.trim()));
            
        } catch {
            // 단순 텍스트로 처리
            return [['내용', rawData]];
        }
    }
    
    // 객체인 경우
    if (typeof rawData === 'object' && rawData !== null) {
        // 객체의 키-값을 테이블로 변환
        const entries = Object.entries(rawData);
        if (entries.length > 0) {
            return [['항목', '내용'], ...entries];
        }
    }
    
    return [];
}
// ... existing code ...
// HTML <table>을 docx.Table로 변환하는 함수 (generateWordContent보다 위에 위치해야 함)
function htmlTableToDocxTable(html) {
    const $ = cheerio.load(html);
    const table = $('table').first();
    if (!table.length) return null;
    const rows = [];
    let maxCells = 0;
    // 1. 모든 행의 셀 개수 파악
    table.find('tr').each((i, tr) => {
        const cellCount = $(tr).find('th,td').length;
        if (cellCount > maxCells) maxCells = cellCount;
    });
    // 2. 행 생성 (셀 개수 맞추기)
    table.find('tr').each((i, tr) => {
        const cells = [];
        $(tr).find('th,td').each((j, td) => {
            const text = $(td).text().trim();
            cells.push(new TableCell({
                children: [new Paragraph({ text })],
                width: { size: 20, type: WidthType.PERCENTAGE }
            }));
        });
        // 부족한 셀은 빈 셀로 패딩
        while (cells.length < maxCells) {
            cells.push(new TableCell({
                children: [new Paragraph({ text: "" })],
                width: { size: 20, type: WidthType.PERCENTAGE }
            }));
        }
        rows.push(new TableRow({ children: cells }));
    });
    return new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: 'single', size: 1, color: 'bdbdbd' },
            bottom: { style: 'single', size: 1, color: 'bdbdbd' },
            left: { style: 'single', size: 1, color: 'bdbdbd' },
            right: { style: 'single', size: 1, color: 'bdbdbd' },
            insideH: { style: 'single', size: 1, color: 'bdbdbd' },
            insideV: { style: 'single', size: 1, color: 'bdbdbd' }
        }
    });
}
// ... existing code ...
// ===================================================================================
// Express 라우트 설정
// ===================================================================================
app.use(express.static('public'));

// Word 문서 생성 함수
function createWordDocument(meetingData) {
    try {
        console.log('[Word 생성] 시작');
        
        // 회의록 데이터 파싱
        const parsedData = parseMeetingMinutes(meetingData);
        
        // Word 문서 생성
        const doc = new Document({
            creator: "AI 회의록 시스템",
            title: parsedData.title || "회의록",
            description: "AI가 자동 생성한 회의록",
            styles: {
                paragraphStyles: [
                    {
                        id: "Normal",
                        name: "Normal",
                        basedOn: "Normal",
                        next: "Normal",
                        run: {
                            font: "맑은 고딕",
                            size: 22
                        },
                        paragraph: {
                            spacing: { after: 120 }
                        }
                    },
                    {
                        id: "Heading1",
                        name: "Heading 1",
                        basedOn: "Normal",
                        next: "Normal",
                        run: {
                            font: "맑은 고딕",
                            size: 32,
                            bold: true,
                            color: "2F4F4F"
                        },
                        paragraph: {
                            spacing: { before: 240, after: 120 }
                        }
                    },
                    {
                        id: "Heading2",
                        name: "Heading 2", 
                        basedOn: "Normal",
                        next: "Normal",
                        run: {
                            font: "맑은 고딕",
                            size: 28,
                            bold: true,
                            color: "4682B4"
                        },
                        paragraph: {
                            spacing: { before: 200, after: 100 }
                        }
                    }
                ]
            },
            sections: [{
                properties: {},
                children: generateWordContent(parsedData)
            }]
        });
        
        console.log('[Word 생성] 완료');
        return doc;
        
    } catch (error) {
        console.error('[Word 생성 오류]:', error);
        return createSimpleWordDocument(meetingData);
    }
}

// 회의록 마크다운 파싱 함수
function parseMeetingMinutes(meetingData) {
    try {
        // 회의록 타이틀과 본문 분리
        const lines = meetingData.split('\n').filter(line => line.trim());
        
        let title = "회의록";
        let content = [];
        let currentSection = null;
        
        for (let line of lines) {
            line = line.trim();
            
            // 제목 추출 (마크다운 제거)
            if (line.includes('회의록') && title === "회의록") {
                title = cleanMarkdownForHeading(line.replace(/[#\-*]/g, ''));
                continue;
            }
            
            // 헤딩 레벨 감지 (마크다운 제거)
            if (line.startsWith('##')) {
                currentSection = {
                    type: 'heading2',
                    text: cleanMarkdownForHeading(line.replace(/^##\s*/, '')),
                    content: []
                };
                content.push(currentSection);
            } else if (line.startsWith('#')) {
                currentSection = {
                    type: 'heading1',
                    text: cleanMarkdownForHeading(line.replace(/^#\s*/, '')),
                    content: []
                };
                content.push(currentSection);
            } else if (line.startsWith('*') || line.startsWith('-')) {
                // 목록 아이템
                const listItem = {
                    type: 'listItem',
                    text: line.replace(/^[\*\-]\s*/, '').trim()
                };
                
                if (currentSection) {
                    currentSection.content.push(listItem);
                } else {
                    content.push(listItem);
                }
            } else if (line.length > 5) {
                // 일반 텍스트
                const paragraph = {
                    type: 'paragraph',
                    text: line
                };
                
                if (currentSection) {
                    currentSection.content.push(paragraph);
                } else {
                    content.push(paragraph);
                }
            }
        }
        
        return { title, content };
        
    } catch (error) {
        console.error('[회의록 파싱 오류]:', error);
        return {
            title: "회의록",
            content: [{
                type: 'paragraph',
                text: meetingData
            }]
        };
    }
}

// 헤딩/제목용 마크다운 제거 함수 (서식 없이 깔끔한 텍스트만)
function cleanMarkdownForHeading(text) {
    return text
        .replace(/^#{1,6}\s*/g, '')                // # ## ### 등 헤딩 마크다운 제거
        .replace(/\**(논의\s*배경)\**/g, '논의 배경')   // 논의 배경 주변 * 모두 제거
        .replace(/\**(핵심\s*내용)\**/g, '핵심 내용')   // 핵심 내용 주변 * 모두 제거
        .replace(/\**(논의\s*결과)\**/g, '논의 결과')   // 논의 결과 주변 * 모두 제거
        .replace(/\**(배경)\**/g, '배경')             // 배경 주변 * 모두 제거
        .replace(/\**(내용)\**/g, '내용')             // 내용 주변 * 모두 제거
        .replace(/\**(결과)\**/g, '결과')             // 결과 주변 * 모두 제거
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')         // ***text*** → text
        .replace(/\*\*(.+?)\*\*/g, '$1')             // **text** → text
        .replace(/\*(.+?)\*/g, '$1')                 // *text* → text
        .replace(/`(.+?)`/g, '$1')                   // `text` → text
        .replace(/~~(.+?)~~/g, '$1')                 // ~~text~~ → text
        .replace(/\*+$/g, '')                        // 끝에 붙은 * 제거
        .trim();
}

// 마크다운을 Word 서식으로 변환하는 함수
function parseMarkdownToWordRuns(text) {
    const runs = [];
    let currentPos = 0;
    
    // 먼저 특정 패턴의 * 제거 (모든 조합 처리)
    text = text
        .replace(/\**(논의\s*배경)\**/g, '논의 배경')   // 논의 배경 주변 * 모두 제거
        .replace(/\**(핵심\s*내용)\**/g, '핵심 내용')   // 핵심 내용 주변 * 모두 제거
        .replace(/\**(논의\s*결과)\**/g, '논의 결과')   // 논의 결과 주변 * 모두 제거
        .replace(/\**(배경)\**/g, '배경')             // 배경 주변 * 모두 제거
        .replace(/\**(내용)\**/g, '내용')             // 내용 주변 * 모두 제거
        .replace(/\**(결과)\**/g, '결과')             // 결과 주변 * 모두 제거
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')         // ***text*** → text
        .replace(/\*\*(.+?)\*\*/g, '$1')             // **text** → text
        .replace(/\*(.+?)\*/g, '$1')                 // *text* → text
        .replace(/`(.+?)`/g, '$1')                   // `text` → text
        .replace(/~~(.+?)~~/g, '$1')                 // ~~text~~ → text
        .replace(/\*+$/g, '')                        // 끝에 붙은 * 제거
        .trim();
    
    // 마크다운 패턴들 (우선순위 순서로 정렬 - 헤딩 추가)
    const patterns = [
        { regex: /^######\s*(.+)$/gm, bold: true, size: 20 }, // ###### h6
        { regex: /^#####\s*(.+)$/gm, bold: true, size: 22 }, // ##### h5  
        { regex: /^####\s*(.+)$/gm, bold: true, size: 24 }, // #### h4
        { regex: /^###\s*(.+)$/gm, bold: true, size: 26 }, // ### h3
        { regex: /^##\s*(.+)$/gm, bold: true, size: 28 }, // ## h2
        { regex: /^#\s*(.+)$/gm, bold: true, size: 32 }, // # h1
        { regex: /\*\*\*(.+?)\*\*\*/g, bold: true, italic: true }, // ***bold italic***
        { regex: /\*\*(.+?)\*\*/g, bold: true }, // **bold**
        { regex: /\*(.+?)\*/g, italic: true }, // *italic*
        { regex: /`(.+?)`/g, color: "D73502", font: "Consolas" }, // `code`
        { regex: /~~(.+?)~~/g, strike: true }, // ~~strikethrough~~
    ];
    
    // 모든 매치를 찾아서 위치별로 정렬
    const matches = [];
    for (const pattern of patterns) {
        let match;
        pattern.regex.lastIndex = 0; // regex 상태 초기화
        while ((match = pattern.regex.exec(text)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                content: match[1],
                style: pattern
            });
        }
    }
    
    // 겹치지 않는 매치들만 선택 (시작 위치 순으로 정렬)
    matches.sort((a, b) => a.start - b.start);
    const validMatches = [];
    for (const match of matches) {
        const isOverlapping = validMatches.some(vm => 
            (match.start >= vm.start && match.start < vm.end) ||
            (match.end > vm.start && match.end <= vm.end)
        );
        if (!isOverlapping) {
            validMatches.push(match);
        }
    }
    
    // TextRun 배열 생성
    for (const match of validMatches) {
        // 매치 이전의 일반 텍스트 추가
        if (currentPos < match.start) {
            const normalText = text.substring(currentPos, match.start);
            if (normalText.trim()) {
                runs.push(new TextRun({
                    text: normalText,
                    font: "맑은 고딕",
                    size: 22
                }));
            }
        }
        
        // 스타일이 적용된 텍스트 추가
        const styledRun = {
            text: match.content,
            font: match.style.font || "맑은 고딕",
            size: match.style.size || 22  // 헤딩 크기 또는 기본 크기
        };
        
        if (match.style.bold) styledRun.bold = true;
        if (match.style.italic) styledRun.italics = true;
        if (match.style.strike) styledRun.strike = true;
        if (match.style.color) styledRun.color = match.style.color;
        
        runs.push(new TextRun(styledRun));
        currentPos = match.end;
    }
    
    // 남은 일반 텍스트 추가
    if (currentPos < text.length) {
        const remainingText = text.substring(currentPos);
        if (remainingText.trim()) {
            runs.push(new TextRun({
                text: remainingText,
                font: "맑은 고딕",
                size: 22
            }));
        }
    }
    
    // 아무 매치가 없으면 전체를 일반 텍스트로
    if (runs.length === 0) {
        runs.push(new TextRun({
            text: text,
            font: "맑은 고딕",
            size: 22
        }));
    }
    
    return runs;
}

// Word 문서 내용 생성
function generateWordContent(parsedData) {
    const children = [];
    // 제목
    children.push(new Paragraph({
        text: cleanMarkdownForHeading(parsedData.title),
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 280 }
    }));
    // 생성 정보
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: `생성일시: ${new Date().toLocaleString('ko-KR')}`,
                font: "맑은 고딕",
                size: 20,
                color: "666666"
            })
        ],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 200 }
    }));
    // 구분선
    children.push(new Paragraph({
        text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
    }));
    // 본문 처리
    for (const section of parsedData.content) {
        // 표: <table>이 포함된 텍스트는 텍스트로 추가하지 않고 표로만 변환
        if (section.type === 'paragraph' && section.text.includes('<table')) {
            const docxTable = htmlTableToDocxTable(section.text);
            if (docxTable) {
                children.push(docxTable);
                continue;
            }
        }
        // 헤딩1
        if (section.type === 'heading1') {
            children.push(new Paragraph({
                text: cleanMarkdownForHeading(section.text),
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 100 }
            }));
            if (section.content) {
                for (const sub of section.content) {
                    if (sub.type === 'paragraph' && sub.text.includes('<table')) {
                        const docxTable = htmlTableToDocxTable(sub.text);
                        if (docxTable) {
                            children.push(docxTable);
                            continue;
                        }
                    }
                    if (sub.type === 'paragraph') {
                        children.push(new Paragraph({
                            children: parseMarkdownToWordRuns(sub.text),
                            spacing: { after: 80 }
                        }));
                    } else if (sub.type === 'listItem') {
                        children.push(new Paragraph({
                            children: parseMarkdownToWordRuns(sub.text),
                            bullet: { level: 0 },
                            spacing: { after: 60 }
                        }));
                    } else if (sub.type === 'heading2') {
                        children.push(new Paragraph({
                            text: cleanMarkdownForHeading(sub.text),
                            heading: HeadingLevel.HEADING_2,
                            alignment: AlignmentType.LEFT,
                            spacing: { before: 160, after: 80 }
                        }));
                    }
                }
            }
            continue;
        }
        // 헤딩2
        if (section.type === 'heading2') {
            children.push(new Paragraph({
                text: cleanMarkdownForHeading(section.text),
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.LEFT,
                spacing: { before: 160, after: 80 }
            }));
            if (section.content) {
                for (const sub of section.content) {
                    if (sub.type === 'paragraph' && sub.text.includes('<table')) {
                        const docxTable = htmlTableToDocxTable(sub.text);
                        if (docxTable) {
                            children.push(docxTable);
                            continue;
                        }
                    }
                    if (sub.type === 'paragraph') {
                        children.push(new Paragraph({
                            children: parseMarkdownToWordRuns(sub.text),
                            spacing: { after: 80 }
                        }));
                    } else if (sub.type === 'listItem') {
                        children.push(new Paragraph({
                            children: parseMarkdownToWordRuns(sub.text),
                            bullet: { level: 0 },
                            spacing: { after: 60 }
                        }));
                    }
                }
            }
            continue;
        }
        // 리스트
        if (section.type === 'listItem') {
            children.push(new Paragraph({
                children: parseMarkdownToWordRuns(section.text),
                bullet: { level: 0 },
                spacing: { after: 60 }
            }));
            continue;
        }
        // 일반 단락
        if (section.type === 'paragraph') {
            children.push(new Paragraph({
                children: parseMarkdownToWordRuns(section.text),
                spacing: { after: 80 }
            }));
            continue;
        }
    }
    return children;
}

// 간단한 Word 문서 생성 (파싱 실패 시 폴백)
function createSimpleWordDocument(meetingData) {
    console.log('[Word 간단 생성] 시작');
    
    // 긴 텍스트를 문단별로 나누어 처리
    const paragraphs = meetingData.split('\n').filter(line => line.trim());
    const children = [
        new Paragraph({
            text: "회의록",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 280 }
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `생성일시: ${new Date().toLocaleString('ko-KR')}`,
                    size: 20,
                    color: "666666"
                })
            ],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 200 }
        }),
        new Paragraph({
            text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        })
    ];
    
    // 각 문단을 마크다운 처리하여 추가
    for (const paragraph of paragraphs) {
        if (paragraph.trim()) {
            children.push(new Paragraph({
                children: parseMarkdownToWordRuns(paragraph),
                spacing: { after: 80 }
            }));
        }
    }
    
    const doc = new Document({
        creator: "AI 회의록 시스템",
        title: "회의록",
        sections: [{
            properties: {},
            children: children
        }]
    });
    
    return doc;
}

// PPT 파일 다운로드 엔드포인트
app.get('/download-ppt/:filename', (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(__dirname, 'temp', fileName);
    
    // 보안 검증: 파일명이 올바른 형식인지 확인
    if (!fileName.match(/^회의록_\d{4}-\d{2}-\d{2}_\d+\.pptx$/)) {
        return res.status(400).send('잘못된 파일명입니다.');
    }
    
    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('파일을 찾을 수 없습니다. 파일이 만료되었거나 삭제되었을 수 있습니다.');
    }
    
    try {
        // 파일 다운로드 헤더 설정
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        
        // 파일 스트림으로 전송
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
            console.log(`[파일 다운로드 완료] ${fileName}`);
        });
        
        fileStream.on('error', (error) => {
            console.error('[파일 다운로드 오류]:', error);
            res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
        });
        
    } catch (error) {
        console.error('[PPT 다운로드 오류]:', error);
        res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
    }
});

// Word 파일 다운로드 엔드포인트
app.get('/download-word/:filename', (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(__dirname, 'temp', fileName);
    
    // 보안 검증: 파일명이 올바른 형식인지 확인
    if (!fileName.match(/^회의록_\d{4}-\d{2}-\d{2}_\d+\.docx$/)) {
        return res.status(400).send('잘못된 파일명입니다.');
    }
    
    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('파일을 찾을 수 없습니다. 파일이 만료되었거나 삭제되었을 수 있습니다.');
    }
    
    try {
        // 파일 다운로드 헤더 설정
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        
        // 파일 스트림으로 전송
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
            console.log(`[Word 다운로드 완료] ${fileName}`);
        });
        
        fileStream.on('error', (error) => {
            console.error('[Word 다운로드 오류]:', error);
            res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
        });
        
    } catch (error) {
        console.error('[Word 다운로드 오류]:', error);
        res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
    }
});

// ===================================================================================
// Socket.IO 연결 핸들링
// ===================================================================================

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
        
        // 마피아 게임 명령어 처리
        if (content.startsWith('/마피아')) {
            handleMafiaGameStart(msgObj);
            return;
        }
        
        // 마피아 게임 종료 명령어 처리
        if (checkGameEndCommand(content) && MAFIA_GAME.isActive) {
            handleMafiaGameEnd();
            return;
        }
        
        // 마피아 게임 중인 경우 답변 처리
        if (MAFIA_GAME.isActive && MAFIA_GAME.gamePhase === 'answering') {
            handleMafiaAnswer(msgObj);
            return;
        }
        
        // 마피아 게임 중이지만 답변시간이 아닌 경우 메시지 차단 (채팅창에 표시 안함)
        if (MAFIA_GAME.isActive && MAFIA_GAME.gamePhase !== 'answering') {
            // 답변시간 종료 후 입력된 메시지는 무시 (채팅창에 표시되지 않음)
            console.log(`[마피아 게임] 답변시간 종료 후 메시지 차단: ${msgObj.from} - ${msgObj.content}`);
            return;
        }
        
        logMessage(msgObj);
        io.emit(SOCKET_EVENTS.MESSAGE, msgObj);
        
        // 회의록 작성 중이 아닐 때만 AI 응답을 큐에 추가
        if (!isConversationPausedForMeetingNotes) {
            addToTurnQueue(msgObj, true);
        }
    });

    // PPT 생성 요청 처리 (완전 강화 버전)
    socket.on('generate_ppt', async () => {
        const fromUser = users.get(socket.id);
        if (!fromUser) return;

        console.log(`[PPT 생성] ${fromUser.username}이(가) PPT 생성을 요청했습니다.`);
        
        // 전체 PPT 생성 과정을 안전하게 감쌈
        let pptStructure = null;
        let pptx = null;
        let fileName = null;
        let filePath = null;
        let meetingData = null; // 상위 스코프로 이동
        
        try {
            // 1단계: 회의록 데이터 검증
            socket.emit('ppt_progress', { stage: 'analyzing', message: 'AI가 회의록을 분석하고 있습니다...' });
            
            const meetingHistory = conversationContext.getFullHistorySnapshot();
            meetingData = meetingHistory.map(m => `${m.from}: ${m.content}`).join('\n');
            
            if (meetingData.length < 50) {
                socket.emit('ppt_error', { message: '회의록 내용이 너무 짧습니다. 더 많은 대화 후 다시 시도해주세요.' });
                return;
            }
            
            console.log(`[PPT 1단계] 회의록 데이터 준비 완료 (${meetingData.length}자)`);
            
        } catch (error) {
            console.error('[PPT 1단계 오류] 회의록 데이터 준비 실패:', error);
            socket.emit('ppt_error', { message: '회의록 데이터를 불러오는 중 오류가 발생했습니다.' });
            return;
        }
        
        try {
            // 2단계: AI 구조 생성
            socket.emit('ppt_progress', { stage: 'structuring', message: '프레젠테이션 구조를 설계하고 있습니다...' });
            
            pptStructure = await ErrorHandler.handleAsyncOperation(
                async () => await generatePptStructure(meetingData),
                'PPT 구조 생성',
                null
            );
            
            if (!pptStructure || !pptStructure.slides || pptStructure.slides.length === 0) {
                throw new Error('PPT 구조 생성 실패');
            }
            
            console.log(`[PPT 2단계] 구조 생성 완료 (${pptStructure.slides.length}개 슬라이드)`);
            
        } catch (error) {
            console.error('[PPT 2단계 오류] 구조 생성 실패:', error);
            
            // 폴백: 기본 구조 사용
            console.log('[PPT 2단계 폴백] 기본 구조로 PPT 생성 시도');
            pptStructure = getDefaultPptStructure();
            socket.emit('ppt_progress', { stage: 'structuring', message: '기본 구조로 프레젠테이션을 생성합니다...' });
        }
        
        try {
            // 3단계: 통합 PPT 생성 시스템 사용
            socket.emit('ppt_progress', { stage: 'creating', message: '통합 시스템으로 PPT를 생성하고 있습니다...' });
            
            const pptGenerator = new UnifiedPPTGenerator();
            pptx = await pptGenerator.generatePPT(meetingData, pptStructure);
            
            if (!pptx) {
                throw new Error('PPT 객체 생성 실패');
            }
            
            console.log(`[PPT 3단계] 통합 PPT 생성 시스템으로 생성 완료`);
            
        } catch (error) {
            console.error('[PPT 3단계 오류] PPT 객체 생성 실패:', error);
            socket.emit('ppt_error', { message: 'PPT 생성 중 오류가 발생했습니다. 단순한 버전으로 재시도합니다.' });
            return;
        }
        
        try {
            // 4단계: 파일 저장 (완전 강화된 방식)
            socket.emit('ppt_progress', { stage: 'saving', message: '파일을 저장하고 있습니다...' });
            
            // 파일명 및 경로 설정
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            fileName = `회의록_${timestamp}_${Date.now()}.pptx`;
            filePath = path.join(__dirname, 'temp', fileName);
            
            // temp 디렉토리가 없으면 생성
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            console.log(`[PPT 4단계] 파일 저장 시도: ${fileName}`);
            
            // 1차 시도: 최신 PptxGenJS API 사용
            let saveSuccess = false;
            try {
                await pptx.writeFile({
                    fileName: filePath,
                    compression: true
                });
                saveSuccess = true;
                console.log(`[PPT 4단계] 최신 API로 파일 저장 완료: ${fileName}`);
            } catch (writeError) {
                console.error('[PPT 4단계 오류] 최신 API 저장 실패:', writeError);
                
                // 2차 시도: 구 방식 API
                try {
                    console.log('[PPT 4단계 폴백] 구 방식으로 저장 시도');
                    await pptx.writeFile(filePath);
                    saveSuccess = true;
                    console.log(`[PPT 4단계 폴백] 구 방식 저장 성공: ${fileName}`);
                } catch (fallbackError) {
                    console.error('[PPT 4단계 폴백 실패]:', fallbackError);
                    
                    // 3차 시도: 스트림 방식
                    try {
                        console.log('[PPT 4단계 최종시도] 스트림 방식으로 저장 시도');
                        const buffer = await pptx.stream();
                        fs.writeFileSync(filePath, buffer);
                        saveSuccess = true;
                        console.log(`[PPT 4단계 최종시도] 스트림 방식 저장 성공: ${fileName}`);
                    } catch (streamError) {
                        console.error('[PPT 4단계 최종시도 실패]:', streamError);
                        // 모든 시도 실패
                    }
                }
            }
            
            if (!saveSuccess) {
                throw new Error('모든 파일 저장 방식이 실패했습니다');
            }
            
        } catch (error) {
            console.error('[PPT 4단계 전체 실패] 파일 저장 불가:', error);
            socket.emit('ppt_error', { 
                message: 'PPT 파일 저장 중 오류가 발생했습니다. 슬라이드 내용을 단순화해보세요.',
                details: error.message 
            });
            return;
        }
        
        try {
            // 5단계: 완료 처리
            console.log(`[PPT 생성 완료] 파일 저장됨: ${fileName}`);
            
            // 클라이언트에 다운로드 링크 전송
            socket.emit('ppt_ready', { 
                fileName: fileName,
                downloadUrl: `/download-ppt/${fileName}`,
                title: pptStructure.title || '회의 결과 보고서',
                slideCount: pptStructure.slides ? pptStructure.slides.length : 0,
                fileSize: fs.existsSync(filePath) ? Math.round(fs.statSync(filePath).size / 1024) + 'KB' : '알 수 없음'
            });
            
            // 1시간 후 임시 파일 자동 삭제
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`[파일 정리] 임시 PPT 파일 삭제: ${fileName}`);
                    }
                } catch (error) {
                    console.error(`[파일 정리 오류] ${fileName} 삭제 실패:`, error);
                }
            }, 60 * 60 * 1000); // 1시간
            
        } catch (error) {
            console.error('[PPT 5단계 오류] 완료 처리 실패:', error);
            socket.emit('ppt_error', { message: 'PPT 생성은 완료되었으나 다운로드 링크 생성에 실패했습니다.' });
        }
    });

    // Word 생성 요청 처리
    socket.on('generate_word', async () => {
        const fromUser = users.get(socket.id);
        if (!fromUser) return;

        console.log(`[Word 생성] ${fromUser.username}이(가) Word 생성을 요청했습니다.`);
        
        let fileName = null;
        let filePath = null;
        let meetingData = null;
        let doc = null;
        
        try {
            // 1단계: 회의록 데이터 준비
            socket.emit('word_progress', { stage: 'preparing', message: '회의록 데이터를 준비하고 있습니다...' });
            
            // 별도 저장소에서 회의록 조회
            if (meetingMinutesStorage.length === 0) {
                socket.emit('word_error', { message: '생성된 회의록이 없습니다. 먼저 회의록을 생성해주세요.' });
                return;
            }
            
            // 가장 최근 회의록 사용
            const latestMeeting = meetingMinutesStorage[meetingMinutesStorage.length - 1];
            meetingData = latestMeeting.content;
            
            if (!meetingData || meetingData.length < 20) {
                socket.emit('word_error', { message: '회의록 내용이 너무 짧습니다.' });
                return;
            }
            
            console.log(`[Word 1단계] 회의록 데이터 준비 완료 (${meetingData.length}자)`);
            
        } catch (error) {
            console.error('[Word 1단계 오류] 회의록 데이터 준비 실패:', error);
            socket.emit('word_error', { message: '회의록 데이터를 불러오는 중 오류가 발생했습니다.' });
            return;
        }
        
        try {
            // 2단계: Word 문서 생성
            socket.emit('word_progress', { stage: 'converting', message: 'Word 문서로 변환하고 있습니다...' });
            
            doc = createWordDocument(meetingData);
            if (!doc) {
                throw new Error('Word 문서 생성 실패');
            }
            
            console.log(`[Word 2단계] Word 문서 생성 완료`);
            
        } catch (error) {
            console.error('[Word 2단계 오류] Word 문서 생성 실패:', error);
            socket.emit('word_error', { message: 'Word 문서 생성 중 오류가 발생했습니다.' });
            return;
        }
        
        try {
            // 3단계: 파일 저장
            socket.emit('word_progress', { stage: 'saving', message: '파일을 저장하고 있습니다...' });
            
            // 파일명 및 경로 설정
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            fileName = `회의록_${timestamp}_${Date.now()}.docx`;
            filePath = path.join(__dirname, 'temp', fileName);
            
            // temp 디렉토리가 없으면 생성
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            console.log(`[Word 3단계] 파일 저장 시도: ${fileName}`);
            
            // Word 문서를 버퍼로 변환 후 파일로 저장
            const buffer = await Packer.toBuffer(doc);
            fs.writeFileSync(filePath, buffer);
            
            console.log(`[Word 3단계] 파일 저장 완료: ${fileName}`);
            
        } catch (error) {
            console.error('[Word 3단계 오류] 파일 저장 실패:', error);
            socket.emit('word_error', { 
                message: 'Word 파일 저장 중 오류가 발생했습니다.',
                details: error.message 
            });
            return;
        }
        
        try {
            // 4단계: 완료 처리
            console.log(`[Word 생성 완료] 파일 저장됨: ${fileName}`);
            
            // 파일 크기 및 페이지 수 계산 (추정)
            const fileSize = fs.existsSync(filePath) ? Math.round(fs.statSync(filePath).size / 1024) + 'KB' : '알 수 없음';
            const estimatedPages = Math.ceil(meetingData.length / 3000); // 3000자당 1페이지로 추정
            
            // 클라이언트에 다운로드 링크 전송
            socket.emit('word_ready', { 
                fileName: fileName,
                downloadUrl: `/download-word/${fileName}`,
                title: "회의록",
                pageCount: estimatedPages,
                fileSize: fileSize
            });
            
            // 1시간 후 임시 파일 자동 삭제
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`[파일 정리] 임시 Word 파일 삭제: ${fileName}`);
                    }
                } catch (error) {
                    console.error(`[파일 정리 오류] ${fileName} 삭제 실패:`, error);
                }
            }, 60 * 60 * 1000); // 1시간
            
        } catch (error) {
            console.error('[Word 4단계 오류] 완료 처리 실패:', error);
            socket.emit('word_error', { message: 'Word 생성은 완료되었으나 다운로드 링크 생성에 실패했습니다.' });
        }
    });

    // 마피아 게임 투표 처리
    socket.on(SOCKET_EVENTS.MAFIA_VOTE, (data) => {
        const fromUser = users.get(socket.id);
        if (!fromUser || fromUser.isAI) return; // AI는 투표 안함
        
        if (!MAFIA_GAME.isActive || MAFIA_GAME.gamePhase !== 'voting') {
            return; // 투표 시간이 아님
        }
        
        const participant = MAFIA_GAME.participants.get(fromUser.username);
        if (!participant || participant.hasVoted) {
            return; // 이미 투표했거나 참가자가 아님
        }
        
        // 투표 기록
        participant.hasVoted = true;
        MAFIA_GAME.votes.set(fromUser.username, data.votedFor);
        
        console.log(`[마피아 게임] ${fromUser.username}이(가) ${data.votedFor}에게 투표`);
        
        // 모든 사람이 투표했는지 확인
        const humanParticipants = Array.from(MAFIA_GAME.participants.values())
            .filter(p => !p.isAI);
        const allVoted = humanParticipants.every(p => p.hasVoted);
        
        if (allVoted) {
            console.log('[AI 찾기 투표] 모든 사람이 투표 완료, 2초 후 다음 라운드로 진행');
            
            // 기존 타임아웃 제거
            if (MAFIA_GAME.votingTimeout) {
                clearTimeout(MAFIA_GAME.votingTimeout);
            }
            
            // 2초 후 투표 종료
            MAFIA_GAME.votingTimeout = setTimeout(() => {
                console.log('[AI 찾기 투표] 모든 투표 완료 후 2초 경과, 투표 종료');
                endVotingPhase();
            }, 2000);
        }
    });

    // 마피아 게임 종료 후 투표 처리 (채팅방 복귀 vs 한번 더)
    socket.on(SOCKET_EVENTS.MAFIA_END_VOTE, (data) => {
        const fromUser = users.get(socket.id);
        if (!fromUser || fromUser.isAI) {
            return; // AI는 투표하지 않음
        }
        
        const success = handleEndGameVote(fromUser.username, data.voteType);
        if (success) {
            socket.emit('vote_confirmed', { voteType: data.voteType });
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
// 🛡️ 무한 루프 방지: 메시지 ID 정리 시스템 (메모리 누수 방지)
// ===================================================================================
setInterval(() => {
    const beforeSize = processedMessageIds.size;
    processedMessageIds.clear(); // 10분마다 모든 ID 정리 (간단한 방식)
    console.log(`[메시지 ID 정리] ${beforeSize}개 → 0개 (메모리 정리 완료)`);
}, MESSAGE_ID_CLEANUP_INTERVAL);

// 🎯 AI 타이밍 데이터 정리 (메모리 관리)
setInterval(() => {
    const now = Date.now();
    const cutoffTime = now - (30 * 60 * 1000); // 30분 전
    
    let cleanedCount = 0;
    for (const [aiName, lastResponseTime] of aiLastResponseTime.entries()) {
        if (lastResponseTime < cutoffTime) {
            aiLastResponseTime.delete(aiName);
            aiLastSpeakTime.delete(aiName);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[AI 타이밍 정리] ${cleanedCount}개 AI 타이밍 데이터 정리 완료`);
    }
}, 30 * 60 * 1000); // 30분마다 실행

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
            const result = await apiLimiter.executeAPICall(
            async (prompt) => await model.generateContent(prompt),
            prompt
        );
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