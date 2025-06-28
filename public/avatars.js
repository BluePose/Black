// 🚀 사이버펑크 미래형 아바타 시스템 - 50개 프리미엄 디자인
const AVATAR_COLLECTION = [
    // 🌟 네온 글로우 시리즈 (1-10)
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="neon1" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </radialGradient>
            <filter id="glow1">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <circle cx="50" cy="50" r="45" fill="url(#neon1)" filter="url(#glow1)" opacity="0.9"/>
        <circle cx="50" cy="50" r="35" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.6"/>
        <circle cx="42" cy="42" r="3" fill="#ffffff" opacity="0.9"/>
        <circle cx="58" cy="42" r="3" fill="#ffffff" opacity="0.9"/>
        <path d="M 42 58 Q 50 65 58 58" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.8"/>
    </svg>`,
    
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cyber1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#44a08d;stop-opacity:1" />
            </linearGradient>
            <filter id="glow2">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,10 85,30 85,70 50,90 15,70 15,30" fill="url(#cyber1)" filter="url(#glow2)" opacity="0.85"/>
        <polygon points="50,20 75,35 75,65 50,80 25,65 25,35" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.7"/>
        <circle cx="42" cy="45" r="2.5" fill="#ffffff"/>
        <circle cx="58" cy="45" r="2.5" fill="#ffffff"/>
        <rect x="47" y="55" width="6" height="3" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="plasma1" cx="50%" cy="50%" r="60%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#ffd93d;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#ff6b6b;stop-opacity:1" />
            </radialGradient>
            <filter id="glow3">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <circle cx="50" cy="50" r="40" fill="url(#plasma1)" filter="url(#glow3)"/>
        <circle cx="50" cy="50" r="30" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="5,5" opacity="0.6"/>
        <ellipse cx="40" cy="43" rx="2" ry="4" fill="#ffffff"/>
        <ellipse cx="60" cy="43" rx="2" ry="4" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="6" ry="3" fill="#ffffff" opacity="0.8"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="tech1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#764ba2;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
            <filter id="glow4">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <rect x="20" y="20" width="60" height="60" rx="15" fill="url(#tech1)" filter="url(#glow4)"/>
        <rect x="25" y="25" width="50" height="50" rx="10" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.5"/>
        <rect x="40" y="40" width="4" height="6" fill="#ffffff"/>
        <rect x="56" y="40" width="4" height="6" fill="#ffffff"/>
        <rect x="45" y="55" width="10" height="4" rx="2" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="holo1" cx="30%" cy="30%" r="70%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:0.9" />
                <stop offset="70%" style="stop-color:#44a08d;stop-opacity:0.7" />
                <stop offset="100%" style="stop-color:#2c3e50;stop-opacity:1" />
            </radialGradient>
            <filter id="glow5">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="M 30 20 Q 50 10 70 20 Q 80 50 70 80 Q 50 90 30 80 Q 20 50 30 20" fill="url(#holo1)" filter="url(#glow5)"/>
        <path d="M 35 25 Q 50 18 65 25 Q 72 50 65 75 Q 50 82 35 75 Q 28 50 35 25" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6"/>
        <ellipse cx="42" cy="43" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="58" cy="43" rx="2.5" ry="3" fill="#ffffff"/>
        <path d="M 42 60 Q 50 65 58 60" stroke="#ffffff" stroke-width="2" fill="none"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="matrix1" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ffd93d;stop-opacity:1" />
            </linearGradient>
            <filter id="glow6">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,15 75,35 65,65 35,65 25,35" fill="url(#matrix1)" filter="url(#glow6)"/>
        <polygon points="50,25 65,40 58,60 42,60 35,40" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.7"/>
        <circle cx="43" cy="42" r="2.5" fill="#ffffff"/>
        <circle cx="57" cy="42" r="2.5" fill="#ffffff"/>
        <path d="M 43 55 Q 50 60 57 55" stroke="#ffffff" stroke-width="1.8" fill="none"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="energy1" cx="50%" cy="40%" r="60%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="80%" style="stop-color:#764ba2;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#000000;stop-opacity:1" />
            </radialGradient>
            <filter id="glow7">
                <feGaussianBlur stdDeviation="2.8" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <ellipse cx="50" cy="50" rx="38" ry="45" fill="url(#energy1)" filter="url(#glow7)"/>
        <ellipse cx="50" cy="50" rx="28" ry="35" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
        <ellipse cx="41" cy="44" rx="2" ry="3.5" fill="#ffffff"/>
        <ellipse cx="59" cy="44" rx="2" ry="3.5" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="7" ry="3.5" fill="#ffffff" opacity="0.8"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="neural1" x1="20%" y1="20%" x2="80%" y2="80%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#44a08d;stop-opacity:0.9" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </linearGradient>
            <filter id="glow8">
                <feGaussianBlur stdDeviation="3.2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,12 88,50 50,88 12,50" fill="url(#neural1)" filter="url(#glow8)"/>
        <polygon points="50,22 78,50 50,78 22,50" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <circle cx="42" cy="45" r="2.8" fill="#ffffff"/>
        <circle cx="58" cy="45" r="2.8" fill="#ffffff"/>
        <rect x="46" y="55" width="8" height="3" rx="1.5" fill="#ffffff"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="quantum1" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:0.9" />
                <stop offset="60%" style="stop-color:#ffd93d;stop-opacity:0.7" />
                <stop offset="100%" style="stop-color:#ff6b6b;stop-opacity:1" />
            </radialGradient>
            <filter id="glow9">
                <feGaussianBlur stdDeviation="3.8" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <circle cx="50" cy="50" r="42" fill="url(#quantum1)" filter="url(#glow9)"/>
        <circle cx="35" cy="35" r="8" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.5"/>
        <circle cx="65" cy="35" r="8" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.5"/>
        <circle cx="50" cy="65" r="8" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.5"/>
        <circle cx="42" cy="45" r="2" fill="#ffffff"/>
        <circle cx="58" cy="45" r="2" fill="#ffffff"/>
        <circle cx="50" cy="57" r="3" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cyber2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#764ba2;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </linearGradient>
            <filter id="glow10">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="M 25 35 L 75 35 L 80 50 L 75 65 L 25 65 L 20 50 Z" fill="url(#cyber2)" filter="url(#glow10)"/>
        <path d="M 30 40 L 70 40 L 74 50 L 70 60 L 30 60 L 26 50 Z" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.6"/>
        <rect x="40" y="45" width="3" height="4" fill="#ffffff"/>
        <rect x="57" y="45" width="3" height="4" fill="#ffffff"/>
        <rect x="47" y="55" width="6" height="2.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    // 🔮 홀로그램 시리즈 (11-20)
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="holo2" cx="40%" cy="30%" r="70%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:0.8" />
                <stop offset="50%" style="stop-color:#44a08d;stop-opacity:0.6" />
                <stop offset="100%" style="stop-color:#2c3e50;stop-opacity:0.9" />
            </radialGradient>
            <filter id="hologlow1">
                <feGaussianBlur stdDeviation="4.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <rect x="20" y="25" width="60" height="50" rx="20" fill="url(#holo2)" filter="url(#hologlow1)" opacity="0.85"/>
        <rect x="25" y="30" width="50" height="40" rx="15" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="2,2" opacity="0.7"/>
        <circle cx="38" cy="45" r="2.5" fill="#ffffff" opacity="0.9"/>
        <circle cx="62" cy="45" r="2.5" fill="#ffffff" opacity="0.9"/>
        <path d="M 38 58 Q 50 63 62 58" stroke="#ffffff" stroke-width="1.8" fill="none" opacity="0.8"/>
        <circle cx="25" cy="25" r="2" fill="#4ecdc4" opacity="0.6"/>
        <circle cx="75" cy="25" r="2" fill="#4ecdc4" opacity="0.6"/>
        <circle cx="25" cy="75" r="2" fill="#4ecdc4" opacity="0.6"/>
        <circle cx="75" cy="75" r="2" fill="#4ecdc4" opacity="0.6"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="plasma2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:0.9" />
                <stop offset="30%" style="stop-color:#ffd93d;stop-opacity:0.7" />
                <stop offset="70%" style="stop-color:#ff6b6b;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </radialGradient>
            <filter id="hologlow2">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <ellipse cx="50" cy="50" rx="35" ry="40" fill="url(#plasma2)" filter="url(#hologlow2)"/>
        <ellipse cx="50" cy="50" rx="25" ry="30" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="4,2" opacity="0.6"/>
        <path d="M 30 30 Q 50 25 70 30" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
        <path d="M 30 70 Q 50 75 70 70" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
        <ellipse cx="41" cy="44" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="59" cy="44" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="6" ry="2.5" fill="#ffffff" opacity="0.8"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="energy2" cx="50%" cy="50%" r="55%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="40%" style="stop-color:#764ba2;stop-opacity:0.8" />
                <stop offset="80%" style="stop-color:#4ecdc4;stop-opacity:0.6" />
                <stop offset="100%" style="stop-color:#44a08d;stop-opacity:1" />
            </radialGradient>
            <filter id="hologlow3">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,15 75,30 80,55 65,75 35,75 20,55 25,30" fill="url(#energy2)" filter="url(#hologlow3)"/>
        <polygon points="50,25 65,35 68,50 58,65 42,65 32,50 35,35" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.7"/>
        <circle cx="43" cy="43" r="2.5" fill="#ffffff"/>
        <circle cx="57" cy="43" r="2.5" fill="#ffffff"/>
        <polygon points="47,55 53,55 51,58" fill="#ffffff" opacity="0.9"/>
        <line x1="50" y1="15" x2="50" y2="25" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
        <line x1="35" y1="75" x2="42" y2="65" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
        <line x1="65" y1="75" x2="58" y2="65" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="tech2" x1="20%" y1="20%" x2="80%" y2="80%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#44a08d;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </linearGradient>
            <filter id="hologlow4">
                <feGaussianBlur stdDeviation="2.8" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="M 30 20 L 70 20 L 80 35 L 75 65 L 25 65 L 20 35 Z" fill="url(#tech2)" filter="url(#hologlow4)"/>
        <path d="M 35 25 L 65 25 L 72 35 L 68 60 L 32 60 L 28 35 Z" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <rect x="40" y="40" width="4" height="5" fill="#ffffff"/>
        <rect x="56" y="40" width="4" height="5" fill="#ffffff"/>
        <rect x="45" y="52" width="10" height="3" rx="1.5" fill="#ffffff" opacity="0.9"/>
        <circle cx="30" cy="30" r="1.5" fill="#4ecdc4"/>
        <circle cx="70" cy="30" r="1.5" fill="#4ecdc4"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="matrix2" cx="50%" cy="40%" r="60%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="60%" style="stop-color:#ffd93d;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </radialGradient>
            <filter id="hologlow5">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <circle cx="50" cy="50" r="40" fill="url(#matrix2)" filter="url(#hologlow5)"/>
        <circle cx="50" cy="50" r="30" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>
        <circle cx="50" cy="50" r="20" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"/>
        <circle cx="42" cy="44" r="2.5" fill="#ffffff"/>
        <circle cx="58" cy="44" r="2.5" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="6" ry="3" fill="#ffffff" opacity="0.9"/>
        <circle cx="20" cy="20" r="2" fill="#ff6b6b" opacity="0.6"/>
        <circle cx="80" cy="80" r="2" fill="#ffd93d" opacity="0.6"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="neural2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#764ba2;stop-opacity:0.9" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </linearGradient>
            <filter id="hologlow6">
                <feGaussianBlur stdDeviation="3.2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,15 85,40 70,75 30,75 15,40" fill="url(#neural2)" filter="url(#hologlow6)"/>
        <polygon points="50,25 75,45 63,68 37,68 25,45" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.6"/>
        <ellipse cx="42" cy="47" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="58" cy="47" rx="2.5" ry="3" fill="#ffffff"/>
        <path d="M 42 58 Q 50 62 58 58" stroke="#ffffff" stroke-width="1.8" fill="none"/>
        <polygon points="50,15 52,20 48,20" fill="#ffffff" opacity="0.7"/>
        <polygon points="30,75 32,70 28,70" fill="#ffffff" opacity="0.7"/>
        <polygon points="70,75 72,70 68,70" fill="#ffffff" opacity="0.7"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="quantum2" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:0.9" />
                <stop offset="40%" style="stop-color:#44a08d;stop-opacity:0.7" />
                <stop offset="80%" style="stop-color:#667eea;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </radialGradient>
            <filter id="hologlow7">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <ellipse cx="50" cy="50" rx="42" ry="35" fill="url(#quantum2)" filter="url(#hologlow7)"/>
        <ellipse cx="50" cy="50" rx="32" ry="25" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.6"/>
        <path d="M 25 40 Q 50 35 75 40" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
        <path d="M 25 60 Q 50 65 75 60" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
        <circle cx="41" cy="45" r="2.5" fill="#ffffff"/>
        <circle cx="59" cy="45" r="2.5" fill="#ffffff"/>
        <rect x="46" y="55" width="8" height="3" rx="1.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cyber3" x1="30%" y1="0%" x2="70%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="30%" style="stop-color:#ffd93d;stop-opacity:0.8" />
                <stop offset="70%" style="stop-color:#ff6b6b;stop-opacity:0.9" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
            <filter id="hologlow8">
                <feGaussianBlur stdDeviation="3.8" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,20 70,35 75,55 60,70 40,70 25,55 30,35" fill="url(#cyber3)" filter="url(#hologlow8)"/>
        <polygon points="50,28 62,40 66,52 55,63 45,63 34,52 38,40" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.7"/>
        <circle cx="43" cy="45" r="2.5" fill="#ffffff"/>
        <circle cx="57" cy="45" r="2.5" fill="#ffffff"/>
        <ellipse cx="50" cy="56" rx="5" ry="2.5" fill="#ffffff" opacity="0.9"/>
        <circle cx="50" cy="20" r="1.5" fill="#ffffff" opacity="0.6"/>
        <circle cx="25" cy="55" r="1.5" fill="#ffffff" opacity="0.6"/>
        <circle cx="75" cy="55" r="1.5" fill="#ffffff" opacity="0.6"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="holo3" cx="40%" cy="30%" r="70%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.9" />
                <stop offset="50%" style="stop-color:#764ba2;stop-opacity:0.7" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </radialGradient>
            <filter id="hologlow9">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <rect x="25" y="25" width="50" height="50" rx="12" fill="url(#holo3)" filter="url(#hologlow9)"/>
        <rect x="30" y="30" width="40" height="40" rx="8" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-dasharray="4,2" opacity="0.6"/>
        <circle cx="38" cy="45" r="2.5" fill="#ffffff"/>
        <circle cx="62" cy="45" r="2.5" fill="#ffffff"/>
        <rect x="45" y="55" width="10" height="3" rx="1.5" fill="#ffffff" opacity="0.9"/>
        <rect x="30" y="35" width="8" height="1" fill="#ffffff" opacity="0.5"/>
        <rect x="62" y="35" width="8" height="1" fill="#ffffff" opacity="0.5"/>
        <rect x="30" y="60" width="8" height="1" fill="#ffffff" opacity="0.5"/>
        <rect x="62" y="60" width="8" height="1" fill="#ffffff" opacity="0.5"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="plasma3" x1="0%" y1="20%" x2="100%" y2="80%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="33%" style="stop-color:#44a08d;stop-opacity:0.8" />
                <stop offset="66%" style="stop-color:#667eea;stop-opacity:0.9" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
            <filter id="hologlow10">
                <feGaussianBlur stdDeviation="3.2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="M 35 18 Q 50 12 65 18 Q 82 35 78 52 Q 75 68 58 75 Q 42 75 25 68 Q 22 52 18 35 Q 22 25 35 18" fill="url(#plasma3)" filter="url(#hologlow10)"/>
        <path d="M 38 22 Q 50 18 62 22 Q 75 35 72 50 Q 70 63 58 68 Q 42 68 30 63 Q 28 50 25 35 Q 28 28 38 22" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6"/>
        <ellipse cx="41" cy="43" rx="2" ry="3" fill="#ffffff"/>
        <ellipse cx="59" cy="43" rx="2" ry="3" fill="#ffffff"/>
        <path d="M 41 56 Q 50 60 59 56" stroke="#ffffff" stroke-width="1.8" fill="none"/>
    </svg>`,

    // ⚡ 에너지 펄스 시리즈 (21-30)
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="pulse1" cx="50%" cy="50%" r="60%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#ffd93d;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#ff6b6b;stop-opacity:1" />
            </radialGradient>
            <filter id="pulseglow1">
                <feGaussianBlur stdDeviation="4.2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <circle cx="50" cy="50" r="38" fill="url(#pulse1)" filter="url(#pulseglow1)"/>
        <circle cx="50" cy="50" r="28" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="6,4" opacity="0.7"/>
        <circle cx="50" cy="50" r="18" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.5"/>
        <circle cx="50" cy="50" r="8" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.8"/>
        <circle cx="43" cy="45" r="2" fill="#ffffff"/>
        <circle cx="57" cy="45" r="2" fill="#ffffff"/>
        <circle cx="50" cy="57" r="3" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="wave1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#44a08d;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </linearGradient>
            <filter id="pulseglow2">
                <feGaussianBlur stdDeviation="3.8" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="M 20 50 Q 30 25 50 35 Q 70 45 80 20 Q 85 40 70 50 Q 50 60 30 70 Q 15 60 20 50" fill="url(#wave1)" filter="url(#pulseglow2)"/>
        <path d="M 25 50 Q 35 30 50 38 Q 65 46 75 25" stroke="#ffffff" stroke-width="1.5" fill="none" opacity="0.6"/>
        <path d="M 25 70 Q 35 60 50 65 Q 65 70 75 60" stroke="#ffffff" stroke-width="1.5" fill="none" opacity="0.6"/>
        <circle cx="42" cy="44" r="2.5" fill="#ffffff"/>
        <circle cx="58" cy="52" r="2.5" fill="#ffffff"/>
        <ellipse cx="50" cy="56" rx="6" ry="3" fill="#ffffff" opacity="0.8"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="vortex1" cx="50%" cy="50%" r="55%">
                <stop offset="0%" style="stop-color:#764ba2;stop-opacity:1" />
                <stop offset="40%" style="stop-color:#667eea;stop-opacity:0.8" />
                <stop offset="80%" style="stop-color:#4ecdc4;stop-opacity:0.9" />
                <stop offset="100%" style="stop-color:#44a08d;stop-opacity:1" />
            </radialGradient>
            <filter id="pulseglow3">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,15 75,25 85,50 75,75 50,85 25,75 15,50 25,25" fill="url(#vortex1)" filter="url(#pulseglow3)"/>
        <polygon points="50,25 65,32 72,50 65,68 50,75 35,68 28,50 35,32" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.6"/>
        <circle cx="42" cy="45" r="2.5" fill="#ffffff"/>
        <circle cx="58" cy="45" r="2.5" fill="#ffffff"/>
        <polygon points="47,56 53,56 50,60" fill="#ffffff" opacity="0.9"/>
        <circle cx="50" cy="15" r="1.5" fill="#ffffff" opacity="0.5"/>
        <circle cx="85" cy="50" r="1.5" fill="#ffffff" opacity="0.5"/>
        <circle cx="50" cy="85" r="1.5" fill="#ffffff" opacity="0.5"/>
        <circle cx="15" cy="50" r="1.5" fill="#ffffff" opacity="0.5"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="crystal1" x1="20%" y1="20%" x2="80%" y2="80%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:0.9" />
                <stop offset="50%" style="stop-color:#ffd93d;stop-opacity:0.7" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
            <filter id="pulseglow4">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,10 70,25 80,45 70,65 50,80 30,65 20,45 30,25" fill="url(#crystal1)" filter="url(#pulseglow4)"/>
        <polygon points="50,20 62,30 68,45 62,60 50,70 38,60 32,45 38,30" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.7"/>
        <line x1="50" y1="20" x2="50" y2="70" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
        <line x1="32" y1="45" x2="68" y2="45" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
        <circle cx="43" cy="42" r="2" fill="#ffffff"/>
        <circle cx="57" cy="48" r="2" fill="#ffffff"/>
        <ellipse cx="50" cy="55" rx="5" ry="2.5" fill="#ffffff" opacity="0.8"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="spark1" cx="40%" cy="30%" r="70%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="60%" style="stop-color:#764ba2;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </radialGradient>
            <filter id="pulseglow5">
                <feGaussianBlur stdDeviation="3.2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <ellipse cx="50" cy="50" rx="40" ry="30" fill="url(#spark1)" filter="url(#pulseglow5)"/>
        <ellipse cx="50" cy="50" rx="30" ry="20" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.6"/>
        <path d="M 30 35 L 70 35 M 30 50 L 70 50 M 30 65 L 70 65" stroke="#ffffff" stroke-width="0.8" opacity="0.4"/>
        <ellipse cx="41" cy="45" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="59" cy="45" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="50" cy="57" rx="6" ry="2.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="flux1" x1="0%" y1="30%" x2="100%" y2="70%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="25%" style="stop-color:#44a08d;stop-opacity:0.8" />
                <stop offset="75%" style="stop-color:#667eea;stop-opacity:0.9" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
            <filter id="pulseglow6">
                <feGaussianBlur stdDeviation="3.8" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="M 25 25 Q 50 15 75 25 Q 85 50 75 75 Q 50 85 25 75 Q 15 50 25 25" fill="url(#flux1)" filter="url(#pulseglow6)"/>
        <path d="M 30 30 Q 50 22 70 30 Q 78 50 70 70 Q 50 78 30 70 Q 22 50 30 30" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <circle cx="35" cy="35" r="2" fill="#ffffff" opacity="0.7"/>
        <circle cx="65" cy="35" r="2" fill="#ffffff" opacity="0.7"/>
        <circle cx="35" cy="65" r="2" fill="#ffffff" opacity="0.7"/>
        <circle cx="65" cy="65" r="2" fill="#ffffff" opacity="0.7"/>
        <circle cx="42" cy="45" r="2.5" fill="#ffffff"/>
        <circle cx="58" cy="45" r="2.5" fill="#ffffff"/>
        <rect x="46" y="55" width="8" height="3" rx="1.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="beam1" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#ffd93d;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#ff6b6b;stop-opacity:1" />
            </radialGradient>
            <filter id="pulseglow7">
                <feGaussianBlur stdDeviation="4.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <rect x="20" y="30" width="60" height="40" rx="12" fill="url(#beam1)" filter="url(#pulseglow7)"/>
        <rect x="25" y="35" width="50" height="30" rx="8" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>
        <rect x="15" y="35" width="8" height="2" fill="#ffffff" opacity="0.6"/>
        <rect x="77" y="35" width="8" height="2" fill="#ffffff" opacity="0.6"/>
        <rect x="15" y="63" width="8" height="2" fill="#ffffff" opacity="0.6"/>
        <rect x="77" y="63" width="8" height="2" fill="#ffffff" opacity="0.6"/>
        <circle cx="40" cy="45" r="2.5" fill="#ffffff"/>
        <circle cx="60" cy="45" r="2.5" fill="#ffffff"/>
        <rect x="45" y="55" width="10" height="3" rx="1.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="nova1" x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" style="stop-color:#764ba2;stop-opacity:1" />
                <stop offset="30%" style="stop-color:#667eea;stop-opacity:0.8" />
                <stop offset="70%" style="stop-color:#4ecdc4;stop-opacity:0.9" />
                <stop offset="100%" style="stop-color:#44a08d;stop-opacity:1" />
            </linearGradient>
            <filter id="pulseglow8">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <polygon points="50,18 68,32 78,50 68,68 50,82 32,68 22,50 32,32" fill="url(#nova1)" filter="url(#pulseglow8)"/>
        <polygon points="50,26 62,36 70,50 62,64 50,74 38,64 30,50 38,36" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.6"/>
        <polygon points="50,34 56,40 60,50 56,60 50,66 44,60 40,50 44,40" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.4"/>
        <circle cx="43" cy="45" r="2" fill="#ffffff"/>
        <circle cx="57" cy="45" r="2" fill="#ffffff"/>
        <polygon points="47,55 53,55 50,58" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="ion1" cx="50%" cy="40%" r="60%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:0.9" />
                <stop offset="50%" style="stop-color:#44a08d;stop-opacity:0.7" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </radialGradient>
            <filter id="pulseglow9">
                <feGaussianBlur stdDeviation="4.2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <ellipse cx="50" cy="50" rx="38" ry="42" fill="url(#ion1)" filter="url(#pulseglow9)"/>
        <ellipse cx="50" cy="50" rx="28" ry="32" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.6"/>
        <ellipse cx="50" cy="50" rx="18" ry="22" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>
        <ellipse cx="41" cy="44" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="59" cy="44" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="6" ry="3" fill="#ffffff" opacity="0.9"/>
        <circle cx="30" cy="25" r="1.5" fill="#4ecdc4" opacity="0.6"/>
        <circle cx="70" cy="75" r="1.5" fill="#44a08d" opacity="0.6"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grid1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#ffd93d;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
            <filter id="pulseglow10">
                <feGaussianBlur stdDeviation="3.8" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <rect x="25" y="25" width="50" height="50" rx="8" fill="url(#grid1)" filter="url(#pulseglow10)"/>
        <rect x="30" y="30" width="40" height="40" rx="5" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.7"/>
        <line x1="30" y1="40" x2="70" y2="40" stroke="#ffffff" stroke-width="0.8" opacity="0.5"/>
        <line x1="30" y1="50" x2="70" y2="50" stroke="#ffffff" stroke-width="0.8" opacity="0.5"/>
        <line x1="30" y1="60" x2="70" y2="60" stroke="#ffffff" stroke-width="0.8" opacity="0.5"/>
        <line x1="40" y1="30" x2="40" y2="70" stroke="#ffffff" stroke-width="0.8" opacity="0.5"/>
        <line x1="50" y1="30" x2="50" y2="70" stroke="#ffffff" stroke-width="0.8" opacity="0.5"/>
        <line x1="60" y1="30" x2="60" y2="70" stroke="#ffffff" stroke-width="0.8" opacity="0.5"/>
        <circle cx="42" cy="45" r="2" fill="#ffffff"/>
        <circle cx="58" cy="45" r="2" fill="#ffffff"/>
        <rect x="46" y="55" width="8" height="2.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    // 🌌 스페이스 시리즈 (31-40)
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="space1" cx="50%" cy="50%" r="60%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </radialGradient>
            <filter id="spaceglow1"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="50" cy="50" r="42" fill="url(#space1)" filter="url(#spaceglow1)"/>
        <circle cx="50" cy="50" r="32" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="8,4" opacity="0.6"/>
        <circle cx="42" cy="45" r="2.5" fill="#ffffff"/><circle cx="58" cy="45" r="2.5" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="7" ry="3" fill="#ffffff" opacity="0.8"/>
        <circle cx="25" cy="25" r="1" fill="#ffffff" opacity="0.7"/>
        <circle cx="75" cy="25" r="1" fill="#ffffff" opacity="0.7"/>
        <circle cx="25" cy="75" r="1" fill="#ffffff" opacity="0.7"/>
        <circle cx="75" cy="75" r="1" fill="#ffffff" opacity="0.7"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="space2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#44a08d;stop-opacity:1" />
            </linearGradient>
            <filter id="spaceglow2"><feGaussianBlur stdDeviation="3.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <polygon points="50,12 88,50 50,88 12,50" fill="url(#space2)" filter="url(#spaceglow2)"/>
        <polygon points="50,22 78,50 50,78 22,50" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <circle cx="42" cy="45" r="2.5" fill="#ffffff"/><circle cx="58" cy="45" r="2.5" fill="#ffffff"/>
        <rect x="46" y="55" width="8" height="3" rx="1.5" fill="#ffffff"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="space3" cx="50%" cy="50%" r="55%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ffd93d;stop-opacity:1" />
            </radialGradient>
            <filter id="spaceglow3"><feGaussianBlur stdDeviation="4.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <ellipse cx="50" cy="50" rx="40" ry="35" fill="url(#space3)" filter="url(#spaceglow3)"/>
        <ellipse cx="50" cy="50" rx="30" ry="25" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-dasharray="5,3" opacity="0.7"/>
        <ellipse cx="41" cy="44" rx="2.5" ry="3" fill="#ffffff"/><ellipse cx="59" cy="44" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="50" cy="57" rx="6" ry="2.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="space4" x1="20%" y1="20%" x2="80%" y2="80%">
                <stop offset="0%" style="stop-color:#764ba2;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </linearGradient>
            <filter id="spaceglow4"><feGaussianBlur stdDeviation="3.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect x="22" y="22" width="56" height="56" rx="16" fill="url(#space4)" filter="url(#spaceglow4)"/>
        <rect x="27" y="27" width="46" height="46" rx="12" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <circle cx="40" cy="45" r="2.5" fill="#ffffff"/><circle cx="60" cy="45" r="2.5" fill="#ffffff"/>
        <rect x="45" y="55" width="10" height="3" rx="1.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="space5" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:0.9" />
                <stop offset="100%" style="stop-color:#44a08d;stop-opacity:1" />
            </radialGradient>
            <filter id="spaceglow5"><feGaussianBlur stdDeviation="3.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <polygon points="50,15 75,30 85,55 70,75 30,75 15,55 25,30" fill="url(#space5)" filter="url(#spaceglow5)"/>
        <polygon points="50,25 65,35 72,52 62,68 38,68 28,52 35,35" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <circle cx="43" cy="43" r="2.5" fill="#ffffff"/><circle cx="57" cy="43" r="2.5" fill="#ffffff"/>
        <polygon points="47,55 53,55 50,58" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="space6" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
            <filter id="spaceglow6"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path d="M 30 20 Q 50 10 70 20 Q 80 50 70 80 Q 50 90 30 80 Q 20 50 30 20" fill="url(#space6)" filter="url(#spaceglow6)"/>
        <path d="M 35 25 Q 50 18 65 25 Q 72 50 65 75 Q 50 82 35 75 Q 28 50 35 25" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <ellipse cx="42" cy="43" rx="2.5" ry="3" fill="#ffffff"/><ellipse cx="58" cy="43" rx="2.5" ry="3" fill="#ffffff"/>
        <path d="M 42 58 Q 50 62 58 58" stroke="#ffffff" stroke-width="2" fill="none"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="space7" cx="50%" cy="50%" r="60%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </radialGradient>
            <filter id="spaceglow7"><feGaussianBlur stdDeviation="3.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="50" cy="50" r="40" fill="url(#space7)" filter="url(#spaceglow7)"/>
        <circle cx="50" cy="50" r="30" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="6,3" opacity="0.7"/>
        <circle cx="50" cy="50" r="20" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>
        <circle cx="42" cy="45" r="2.5" fill="#ffffff"/><circle cx="58" cy="45" r="2.5" fill="#ffffff"/>
        <circle cx="50" cy="57" r="3.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="space8" x1="30%" y1="0%" x2="70%" y2="100%">
                <stop offset="0%" style="stop-color:#ffd93d;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ff6b6b;stop-opacity:1" />
            </linearGradient>
            <filter id="spaceglow8"><feGaussianBlur stdDeviation="3.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <polygon points="50,18 68,28 78,50 68,72 50,82 32,72 22,50 32,28" fill="url(#space8)" filter="url(#spaceglow8)"/>
        <polygon points="50,26 62,34 70,50 62,66 50,74 38,66 30,50 38,34" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <circle cx="43" cy="45" r="2.5" fill="#ffffff"/><circle cx="57" cy="45" r="2.5" fill="#ffffff"/>
        <ellipse cx="50" cy="56" rx="5" ry="2.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="space9" cx="50%" cy="50%" r="55%">
                <stop offset="0%" style="stop-color:#44a08d;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </radialGradient>
            <filter id="spaceglow9"><feGaussianBlur stdDeviation="4.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <ellipse cx="50" cy="50" rx="38" ry="42" fill="url(#space9)" filter="url(#spaceglow9)"/>
        <ellipse cx="50" cy="50" rx="28" ry="32" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-dasharray="5,3" opacity="0.6"/>
        <ellipse cx="41" cy="44" rx="2.5" ry="3" fill="#ffffff"/><ellipse cx="59" cy="44" rx="2.5" ry="3" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="6" ry="3" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="space10" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#764ba2;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </linearGradient>
            <filter id="spaceglow10"><feGaussianBlur stdDeviation="3.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect x="25" y="25" width="50" height="50" rx="12" fill="url(#space10)" filter="url(#spaceglow10)"/>
        <rect x="30" y="30" width="40" height="40" rx="8" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/>
        <circle cx="38" cy="45" r="2.5" fill="#ffffff"/><circle cx="62" cy="45" r="2.5" fill="#ffffff"/>
        <rect x="45" y="55" width="10" height="3" rx="1.5" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    // 🔥 파이널 시리즈 (41-50)
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="final1" cx="50%" cy="50%" r="60%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ffd93d;stop-opacity:1" />
            </radialGradient>
            <filter id="finalglow1"><feGaussianBlur stdDeviation="4.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="50" cy="50" r="45" fill="url(#final1)" filter="url(#finalglow1)"/>
        <circle cx="50" cy="50" r="35" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="8,4" opacity="0.8"/>
        <circle cx="42" cy="45" r="3" fill="#ffffff"/><circle cx="58" cy="45" r="3" fill="#ffffff"/>
        <path d="M 42 60 Q 50 65 58 60" stroke="#ffffff" stroke-width="2.5" fill="none"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="final2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#44a08d;stop-opacity:1" />
            </linearGradient>
            <filter id="finalglow2"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <polygon points="50,10 90,50 50,90 10,50" fill="url(#final2)" filter="url(#finalglow2)"/>
        <polygon points="50,20 80,50 50,80 20,50" fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.7"/>
        <circle cx="42" cy="45" r="2.8" fill="#ffffff"/><circle cx="58" cy="45" r="2.8" fill="#ffffff"/>
        <rect x="46" y="55" width="8" height="4" rx="2" fill="#ffffff"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="final3" cx="50%" cy="50%" r="55%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </radialGradient>
            <filter id="finalglow3"><feGaussianBlur stdDeviation="3.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <ellipse cx="50" cy="50" rx="42" ry="38" fill="url(#final3)" filter="url(#finalglow3)"/>
        <ellipse cx="50" cy="50" rx="32" ry="28" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.7"/>
        <ellipse cx="41" cy="44" rx="2.5" ry="3.5" fill="#ffffff"/><ellipse cx="59" cy="44" rx="2.5" ry="3.5" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="7" ry="3" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="final4" x1="20%" y1="20%" x2="80%" y2="80%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </linearGradient>
            <filter id="finalglow4"><feGaussianBlur stdDeviation="4.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect x="20" y="20" width="60" height="60" rx="18" fill="url(#final4)" filter="url(#finalglow4)"/>
        <rect x="25" y="25" width="50" height="50" rx="14" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.7"/>
        <circle cx="40" cy="45" r="2.8" fill="#ffffff"/><circle cx="60" cy="45" r="2.8" fill="#ffffff"/>
        <rect x="45" y="55" width="10" height="4" rx="2" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="final5" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:#4ecdc4;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </radialGradient>
            <filter id="finalglow5"><feGaussianBlur stdDeviation="3.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <polygon points="50,15 75,25 85,50 75,75 50,85 25,75 15,50 25,25" fill="url(#final5)" filter="url(#finalglow5)"/>
        <polygon points="50,25 65,32 72,50 65,68 50,75 35,68 28,50 35,32" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.7"/>
        <circle cx="43" cy="43" r="2.5" fill="#ffffff"/><circle cx="57" cy="43" r="2.5" fill="#ffffff"/>
        <polygon points="47,55 53,55 50,58" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="final6" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ffd93d;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ff6b6b;stop-opacity:1" />
            </linearGradient>
            <filter id="finalglow6"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path d="M 25 25 Q 50 15 75 25 Q 85 50 75 75 Q 50 85 25 75 Q 15 50 25 25" fill="url(#final6)" filter="url(#finalglow6)"/>
        <path d="M 30 30 Q 50 22 70 30 Q 78 50 70 70 Q 50 78 30 70 Q 22 50 30 30" fill="none" stroke="#ffffff" stroke-width="1.3" opacity="0.7"/>
        <circle cx="42" cy="43" r="2.5" fill="#ffffff"/><circle cx="58" cy="43" r="2.5" fill="#ffffff"/>
        <path d="M 42 58 Q 50 62 58 58" stroke="#ffffff" stroke-width="2" fill="none"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="final7" cx="50%" cy="50%" r="60%">
                <stop offset="0%" style="stop-color:#764ba2;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#4ecdc4;stop-opacity:1" />
            </radialGradient>
            <filter id="finalglow7"><feGaussianBlur stdDeviation="3.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="50" cy="50" r="40" fill="url(#final7)" filter="url(#finalglow7)"/>
        <circle cx="50" cy="50" r="30" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-dasharray="7,3" opacity="0.8"/>
        <circle cx="50" cy="50" r="20" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="4,2" opacity="0.5"/>
        <circle cx="42" cy="45" r="2.8" fill="#ffffff"/><circle cx="58" cy="45" r="2.8" fill="#ffffff"/>
        <circle cx="50" cy="57" r="4" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="final8" x1="30%" y1="0%" x2="70%" y2="100%">
                <stop offset="0%" style="stop-color:#44a08d;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#667eea;stop-opacity:1" />
            </linearGradient>
            <filter id="finalglow8"><feGaussianBlur stdDeviation="4.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <polygon points="50,18 68,30 78,50 68,70 50,82 32,70 22,50 32,30" fill="url(#final8)" filter="url(#finalglow8)"/>
        <polygon points="50,26 62,36 70,50 62,64 50,74 38,64 30,50 38,36" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.7"/>
        <circle cx="43" cy="45" r="2.8" fill="#ffffff"/><circle cx="57" cy="45" r="2.8" fill="#ffffff"/>
        <ellipse cx="50" cy="56" rx="6" ry="2.8" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="final9" cx="50%" cy="50%" r="55%">
                <stop offset="0%" style="stop-color:#ff6b6b;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
            </radialGradient>
            <filter id="finalglow9"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <ellipse cx="50" cy="50" rx="40" ry="42" fill="url(#final9)" filter="url(#finalglow9)"/>
        <ellipse cx="50" cy="50" rx="30" ry="32" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.7"/>
        <ellipse cx="41" cy="44" rx="2.8" ry="3.5" fill="#ffffff"/><ellipse cx="59" cy="44" rx="2.8" ry="3.5" fill="#ffffff"/>
        <ellipse cx="50" cy="58" rx="7" ry="3.2" fill="#ffffff" opacity="0.9"/>
    </svg>`,

    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="final10" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#4ecdc4;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#44a08d;stop-opacity:1" />
            </linearGradient>
            <filter id="finalglow10"><feGaussianBlur stdDeviation="4.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect x="22" y="22" width="56" height="56" rx="16" fill="url(#final10)" filter="url(#finalglow10)"/>
        <rect x="27" y="27" width="46" height="46" rx="12" fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.8"/>
        <circle cx="38" cy="45" r="3" fill="#ffffff"/><circle cx="62" cy="45" r="3" fill="#ffffff"/>
        <rect x="44" y="55" width="12" height="4" rx="2" fill="#ffffff" opacity="0.9"/>
        <circle cx="30" cy="30" r="1.5" fill="#ffffff" opacity="0.6"/>
        <circle cx="70" cy="30" r="1.5" fill="#ffffff" opacity="0.6"/>
        <circle cx="30" cy="70" r="1.5" fill="#ffffff" opacity="0.6"/>
        <circle cx="70" cy="70" r="1.5" fill="#ffffff" opacity="0.6"/>
    </svg>`
];

// 사용자명을 기반으로 해시값을 생성하는 함수
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32비트 정수로 변환
    }
    return Math.abs(hash);
}

// 사용자명을 기반으로 아바타 인덱스를 생성하는 함수
function getUserAvatarIndex(username) {
    return hashString(username) % AVATAR_COLLECTION.length;
}

// 아바타 SVG를 가져오는 함수
function getUserAvatar(username) {
    const index = getUserAvatarIndex(username);
    return AVATAR_COLLECTION[index];
}

// 아바타를 DOM 요소로 생성하는 함수
function createAvatarElement(username, size = 32) {
    const avatarSvg = getUserAvatar(username);
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'user-avatar';
    avatarDiv.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        border: 2px solid rgba(255,255,255,0.2);
        background: transparent;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    `;
    avatarDiv.innerHTML = avatarSvg;
    
    // SVG 스타일 조정
    const svg = avatarDiv.querySelector('svg');
    if (svg) {
        svg.style.cssText = `
            width: 100%;
            height: 100%;
            display: block;
        `;
    }
    
    return avatarDiv;
}

// 서버용 함수 (Node.js 환경에서 사용)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AVATAR_COLLECTION,
        hashString,
        getUserAvatarIndex,
        getUserAvatar
    };
} 