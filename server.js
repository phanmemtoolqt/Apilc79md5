const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());

// Tạo thư mục public nếu chưa có
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { status: 'error', message: 'Quá nhiều request, vui lòng thử lại sau' }
});
app.use('/api/', limiter);

// ==================== CONFIG ====================
const API_URL = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
const MAX_HISTORY = 20;
const FETCH_INTERVAL = 30000;

// ==================== DATA STORAGE ====================
let sessionData = [];
let predictionHistory = [];
let lastFetchTime = null;

// ==================== AI PREDICTOR CLASS PREMIUM ====================
class AIDicePredictorPremium {
    constructor() {
        this.version = '3.0.0-PREMIUM';
        this.algorithmName = 'DeepAI-VanHoa-Premium';
        this.weights = {
            balanceAnalysis: 0.20,
            streakAnalysis: 0.20,
            pointAnalysis: 0.15,
            diceAnalysis: 0.15,
            patternAnalysis: 0.15,
            cycleAnalysis: 0.15
        };
    }

    analyzeComprehensive(history) {
        if (!history || history.length < 3) {
            return this.getDefaultPrediction();
        }

        const recentHistory = history.slice(0, Math.min(history.length, 200));
        const results = recentHistory.map(item => item.resultTruyenThong);
        const points = recentHistory.map(item => item.point);
        const dices = recentHistory.flatMap(item => item.dices);

        const scores = { TAI: 0, XIU: 0 };
        let analysisDetails = {};

        // 1. Phân tích cân bằng Tài/Xỉu (20%)
        const total = results.length;
        const taiCount = results.filter(r => r === 'TAI').length;
        const xiuCount = results.filter(r => r === 'XIU').length;
        const taiRatio = taiCount / total;
        
        if (taiRatio > 0.65) scores.XIU += 25;
        else if (taiRatio < 0.35) scores.TAI += 25;
        else if (taiRatio > 0.55) scores.XIU += 18;
        else if (taiRatio < 0.45) scores.TAI += 18;
        else if (taiRatio > 0.52) scores.XIU += 10;
        else if (taiRatio < 0.48) scores.TAI += 10;
        else { scores.TAI += 12; scores.XIU += 12; }
        
        analysisDetails.balanceRatio = taiRatio;

        // 2. Phân tích streak (20%)
        let streak = 1;
        const currentType = results[0];
        for (let i = 1; i < results.length; i++) {
            if (results[i] === currentType) streak++;
            else break;
        }
        
        if (streak >= 6) {
            if (currentType === 'TAI') scores.XIU += 30;
            else scores.TAI += 30;
        } else if (streak >= 4) {
            if (currentType === 'TAI') scores.XIU += 22;
            else scores.TAI += 22;
        } else if (streak >= 2) {
            if (currentType === 'TAI') scores.TAI += 18;
            else scores.XIU += 18;
        }
        
        analysisDetails.streak = streak;
        analysisDetails.currentType = currentType;

        // 3. Phân tích điểm số (15%)
        const avgPoint = points.reduce((a, b) => a + b, 0) / points.length;
        const recentAvgPoint = points.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        
        if (avgPoint > 11.8) scores.XIU += 20;
        else if (avgPoint < 9.2) scores.TAI += 20;
        else if (avgPoint > 11.2) scores.XIU += 12;
        else if (avgPoint < 9.8) scores.TAI += 12;
        
        if (recentAvgPoint > 12) scores.XIU += 15;
        else if (recentAvgPoint < 9) scores.TAI += 15;
        
        analysisDetails.avgPoint = avgPoint;
        analysisDetails.recentAvgPoint = recentAvgPoint;

        // 4. Phân tích xúc xắc (15%)
        const diceFreq = {};
        dices.forEach(d => diceFreq[d] = (diceFreq[d] || 0) + 1);
        const dice6Count = diceFreq[6] || 0;
        const dice1Count = diceFreq[1] || 0;
        const totalDice = dices.length;
        
        const highDice = (diceFreq[4] || 0) + (diceFreq[5] || 0) + (diceFreq[6] || 0);
        const lowDice = (diceFreq[1] || 0) + (diceFreq[2] || 0) + (diceFreq[3] || 0);
        
        if (dice6Count > totalDice * 0.28) scores.TAI += 18;
        else if (dice1Count > totalDice * 0.28) scores.XIU += 18;
        
        if (highDice > lowDice * 1.4) scores.TAI += 12;
        else if (lowDice > highDice * 1.4) scores.XIU += 12;
        
        // Phân tích xúc xắc gần đây
        const recentDices = recentHistory.slice(0, 10).flatMap(item => item.dices);
        const recentDiceFreq = {};
        recentDices.forEach(d => recentDiceFreq[d] = (recentDiceFreq[d] || 0) + 1);
        const recentHighDice = (recentDiceFreq[4] || 0) + (recentDiceFreq[5] || 0) + (recentDiceFreq[6] || 0);
        const recentLowDice = (recentDiceFreq[1] || 0) + (recentDiceFreq[2] || 0) + (recentDiceFreq[3] || 0);
        
        if (recentHighDice > recentLowDice * 1.5) scores.TAI += 10;
        else if (recentLowDice > recentHighDice * 1.5) scores.XIU += 10;
        
        analysisDetails.diceFreq = diceFreq;
        analysisDetails.recentDiceFreq = recentDiceFreq;

        // 5. Phân tích mẫu (15%)
        if (results.length >= 5) {
            const last5 = results.slice(0, 5);
            const pattern5 = last5.map(r => r === 'TAI' ? 'T' : 'X').join('');
            
            const pattern5Weights = {
                'TTTTT': { XIU: 35 },
                'XXXXX': { TAI: 35 },
                'TTTTX': { XIU: 25 },
                'XXXXT': { TAI: 25 },
                'TTTXX': { XIU: 20 },
                'XXXTT': { TAI: 20 },
                'TTXTT': { TAI: 15, XIU: 10 },
                'XXTXX': { XIU: 15, TAI: 10 },
                'TXTXT': { TAI: 12, XIU: 12 },
                'XTXTX': { XIU: 12, TAI: 12 }
            };
            
            if (pattern5Weights[pattern5]) {
                if (pattern5Weights[pattern5].TAI) scores.TAI += pattern5Weights[pattern5].TAI;
                if (pattern5Weights[pattern5].XIU) scores.XIU += pattern5Weights[pattern5].XIU;
            }
            
            // Pattern 3 gần nhất
            const last3 = results.slice(0, 3);
            const pattern3 = last3.map(r => r === 'TAI' ? 'T' : 'X').join('');
            const pattern3Weights = {
                'TTT': { XIU: 20 },
                'XXX': { TAI: 20 },
                'TTX': { XIU: 15 },
                'XXT': { TAI: 15 },
                'TXT': { TAI: 10, XIU: 8 },
                'XTX': { XIU: 10, TAI: 8 }
            };
            
            if (pattern3Weights[pattern3]) {
                if (pattern3Weights[pattern3].TAI) scores.TAI += pattern3Weights[pattern3].TAI;
                if (pattern3Weights[pattern3].XIU) scores.XIU += pattern3Weights[pattern3].XIU;
            }
            
            analysisDetails.pattern5 = pattern5;
            analysisDetails.pattern3 = pattern3;
        }

        // 6. Phân tích chu kỳ (15%)
        let cycles = 0;
        for (let i = 1; i < Math.min(results.length, 30); i++) {
            if (results[i] !== results[i-1]) cycles++;
        }
        
        const cycleRate = cycles / Math.min(results.length - 1, 29);
        
        if (cycleRate > 0.7) {
            if (currentType === 'TAI') scores.XIU += 15;
            else scores.TAI += 15;
        } else if (cycleRate < 0.3) {
            if (currentType === 'TAI') scores.TAI += 15;
            else scores.XIU += 15;
        }
        
        analysisDetails.cycleRate = cycleRate;
        analysisDetails.cycles = cycles;

        const totalScore = scores.TAI + scores.XIU;
        const prediction = scores.TAI >= scores.XIU ? 'TAI' : 'XIU';
        const confidence = totalScore > 0 ? Math.min((Math.max(scores.TAI, scores.XIU) / totalScore) * 100, 99.99) : 50;
        const taiProbability = totalScore > 0 ? (scores.TAI / totalScore) * 100 : 50;
        const xiuProbability = totalScore > 0 ? (scores.XIU / totalScore) * 100 : 50;

        return {
            prediction,
            confidence: Math.round(confidence * 100) / 100,
            scores,
            taiProbability: Math.round(taiProbability * 100) / 100,
            xiuProbability: Math.round(xiuProbability * 100) / 100,
            analysis: {
                totalSamples: recentHistory.length,
                taiCount,
                xiuCount,
                currentStreak: streak,
                currentType,
                avgPoint: Math.round(avgPoint * 100) / 100,
                recentAvgPoint: Math.round(recentAvgPoint * 100) / 100,
                balanceRatio: Math.round(taiRatio * 100) / 100,
                cycleRate: Math.round(cycleRate * 100) / 100,
                mostCommonDice: this.getMostCommonDice(dices),
                algorithm: this.algorithmName,
                version: this.version,
                details: analysisDetails
            }
        };
    }

    getMostCommonDice(dices) {
        const freq = {};
        dices.forEach(d => freq[d] = (freq[d] || 0) + 1);
        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
        return sorted.slice(0, 3).map(([value, count]) => ({ value: parseInt(value), count }));
    }

    getDefaultPrediction() {
        return {
            prediction: 'TAI',
            confidence: 50,
            scores: { TAI: 50, XIU: 50 },
            taiProbability: 50,
            xiuProbability: 50,
            analysis: {
                totalSamples: 0,
                taiCount: 0,
                xiuCount: 0,
                currentStreak: 0,
                currentType: null,
                avgPoint: 0,
                recentAvgPoint: 0,
                balanceRatio: 0,
                cycleRate: 0,
                mostCommonDice: [],
                algorithm: this.algorithmName,
                version: this.version,
                details: {}
            }
        };
    }
}

const predictor = new AIDicePredictorPremium();

// ==================== API FUNCTIONS ====================
async function fetchSessionData() {
    try {
        const response = await axios.get(API_URL, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'vi-VN,vi;q=0.9',
                'Cache-Control': 'no-cache'
            }
        });

        if (response.data && response.data.list) {
            sessionData = response.data.list.sort((a, b) => b.id - a.id);
            lastFetchTime = new Date();
            console.log(`[PREMIUM] Đã cập nhật ${sessionData.length} phiên`);
            return true;
        }
    } catch (error) {
        console.error('[PREMIUM] Lỗi fetch:', error.message);
    }
    return false;
}

function updatePredictionResults() {
    if (!sessionData.length) return;

    predictionHistory.forEach(pred => {
        if (pred.status === 'pending') {
            const session = sessionData.find(s => s.id === pred.sessionId);
            if (session) {
                pred.actualResult = session.resultTruyenThong;
                pred.actualDices = session.dices;
                pred.actualPoint = session.point;
                pred.status = 'completed';
                pred.isCorrect = pred.prediction === pred.actualResult;
                pred.completedAt = new Date().toISOString();
            }
        }
    });
}

function calculateAccuracy() {
    const completed = predictionHistory.filter(p => p.status === 'completed');
    if (!completed.length) return 0;
    const correct = completed.filter(p => p.isCorrect).length;
    return Math.round((correct / completed.length) * 10000) / 100;
}

// ==================== API ROUTES ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Dự đoán chính - /vanhoa
app.get('/vanhoa', async (req, res) => {
    try {
        if (!sessionData.length) {
            await fetchSessionData();
        }

        if (!sessionData.length) {
            return res.status(500).json({
                status: 'error',
                message: 'Không thể lấy dữ liệu từ API gốc'
            });
        }

        const prediction = predictor.analyzeComprehensive(sessionData.slice(0, 200));
        const latestSession = sessionData[0];
        const nextSessionId = latestSession ? latestSession.id + 1 : null;

        const predictionRecord = {
            id: predictionHistory.length + 1,
            sessionId: nextSessionId,
            prediction: prediction.prediction,
            confidence: prediction.confidence,
            taiProbability: prediction.taiProbability,
            xiuProbability: prediction.xiuProbability,
            timestamp: new Date().toISOString(),
            status: 'pending',
            actualResult: null,
            actualDices: null,
            actualPoint: null,
            isCorrect: null,
            completedAt: null
        };

        predictionHistory.push(predictionRecord);

        if (predictionHistory.length > MAX_HISTORY) {
            predictionHistory = predictionHistory.slice(-MAX_HISTORY);
        }

        updatePredictionResults();

        res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            predictor: {
                name: 'VanHoa CSKHToolHehe Premium',
                version: predictor.version,
                algorithm: predictor.algorithmName
            },
            data: {
                nextSessionId,
                prediction: prediction.prediction,
                confidence: prediction.confidence,
                taiProbability: prediction.taiProbability,
                xiuProbability: prediction.xiuProbability,
                scores: prediction.scores,
                analysis: prediction.analysis,
                latestSessions: sessionData.slice(0, 10).map(s => ({
                    id: s.id,
                    result: s.resultTruyenThong,
                    dices: s.dices,
                    point: s.point
                })),
                sourceAPI: API_URL,
                lastFetchTime: lastFetchTime ? lastFetchTime.toISOString() : null
            }
        });
    } catch (error) {
        console.error('[PREMIUM] Lỗi predict:', error);
        res.status(500).json({
            status: 'error',
            message: 'Lỗi server: ' + error.message
        });
    }
});

// API Dự đoán
app.get('/api/predict', async (req, res) => {
    try {
        if (!sessionData.length) {
            await fetchSessionData();
        }

        if (!sessionData.length) {
            return res.status(500).json({
                status: 'error',
                message: 'Không thể lấy dữ liệu từ API gốc'
            });
        }

        const prediction = predictor.analyzeComprehensive(sessionData.slice(0, 200));
        const latestSession = sessionData[0];
        const nextSessionId = latestSession ? latestSession.id + 1 : null;

        const predictionRecord = {
            id: predictionHistory.length + 1,
            sessionId: nextSessionId,
            prediction: prediction.prediction,
            confidence: prediction.confidence,
            taiProbability: prediction.taiProbability,
            xiuProbability: prediction.xiuProbability,
            timestamp: new Date().toISOString(),
            status: 'pending',
            actualResult: null,
            actualDices: null,
            actualPoint: null,
            isCorrect: null,
            completedAt: null
        };

        predictionHistory.push(predictionRecord);

        if (predictionHistory.length > MAX_HISTORY) {
            predictionHistory = predictionHistory.slice(-MAX_HISTORY);
        }

        updatePredictionResults();

        res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            predictor: {
                name: 'VanHoa CSKHToolHehe Premium',
                version: predictor.version,
                algorithm: predictor.algorithmName
            },
            data: {
                nextSessionId,
                prediction: prediction.prediction,
                confidence: prediction.confidence,
                taiProbability: prediction.taiProbability,
                xiuProbability: prediction.xiuProbability,
                scores: prediction.scores,
                analysis: prediction.analysis,
                latestSessions: sessionData.slice(0, 10).map(s => ({
                    id: s.id,
                    result: s.resultTruyenThong,
                    dices: s.dices,
                    point: s.point
                })),
                sourceAPI: API_URL,
                lastFetchTime: lastFetchTime ? lastFetchTime.toISOString() : null
            }
        });
    } catch (error) {
        console.error('[PREMIUM] Lỗi predict:', error);
        res.status(500).json({
            status: 'error',
            message: 'Lỗi server: ' + error.message
        });
    }
});

// API Lịch sử dự đoán
app.get('/api/history', (req, res) => {
    updatePredictionResults();
    
    const completed = predictionHistory.filter(p => p.status === 'completed');
    const correct = completed.filter(p => p.isCorrect).length;
    const incorrect = completed.filter(p => !p.isCorrect).length;
    
    res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        data: {
            predictions: predictionHistory,
            totalPredictions: predictionHistory.length,
            completedPredictions: completed.length,
            pendingPredictions: predictionHistory.filter(p => p.status === 'pending').length,
            accuracy: calculateAccuracy(),
            stats: {
                totalCorrect: correct,
                totalIncorrect: incorrect,
                winRate: completed.length > 0 ? Math.round((correct / completed.length) * 10000) / 100 : 0,
                avgConfidence: predictionHistory.length > 0 
                    ? Math.round(predictionHistory.reduce((a, b) => a + b.confidence, 0) / predictionHistory.length * 100) / 100
                    : 0
            }
        }
    });
});

// API Dữ liệu mới nhất từ API gốc
app.get('/api/latest', async (req, res) => {
    await fetchSessionData();
    
    res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        sourceAPI: API_URL,
        lastUpdated: lastFetchTime ? lastFetchTime.toISOString() : null,
        data: sessionData.slice(0, 50).map(s => ({
            id: s.id,
            resultTruyenThong: s.resultTruyenThong,
            dices: s.dices,
            point: s.point
        })),
        stats: {
            total: sessionData.length,
            taiCount: sessionData.filter(s => s.resultTruyenThong === 'TAI').length,
            xiuCount: sessionData.filter(s => s.resultTruyenThong === 'XIU').length,
            taiRatio: sessionData.length > 0 
                ? Math.round((sessionData.filter(s => s.resultTruyenThong === 'TAI').length / sessionData.length) * 10000) / 100 
                : 0
        }
    });
});

// API Phân tích chi tiết
app.get('/api/analysis', (req, res) => {
    if (!sessionData.length) {
        return res.json({ status: 'error', message: 'Chưa có dữ liệu' });
    }

    const results = sessionData.map(s => s.resultTruyenThong);
    const points = sessionData.map(s => s.point);
    const dices = sessionData.flatMap(s => s.dices);

    // Phân phối điểm
    const pointDistribution = {};
    for (let i = 3; i <= 18; i++) {
        pointDistribution[i] = points.filter(p => p === i).length;
    }

    // Tần suất xúc xắc
    const diceFrequency = {};
    for (let i = 1; i <= 6; i++) {
        diceFrequency[i] = dices.filter(d => d === i).length;
    }

    const diceSorted = Object.entries(diceFrequency).sort((a, b) => b[1] - a[1]);

    // Streak
    let currentStreak = 1;
    let longestTai = 0;
    let longestXiu = 0;
    let tempStreak = 1;

    for (let i = 1; i < results.length; i++) {
        if (results[i] === results[i-1]) {
            tempStreak++;
        } else {
            if (results[i-1] === 'TAI' && tempStreak > longestTai) longestTai = tempStreak;
            if (results[i-1] === 'XIU' && tempStreak > longestXiu) longestXiu = tempStreak;
            tempStreak = 1;
        }
    }

    res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        sourceAPI: API_URL,
        data: {
            totalSessions: sessionData.length,
            resultDistribution: {
                TAI: results.filter(r => r === 'TAI').length,
                XIU: results.filter(r => r === 'XIU').length
            },
            pointAnalysis: {
                min: Math.min(...points),
                max: Math.max(...points),
                average: Math.round(points.reduce((a, b) => a + b, 0) / points.length * 100) / 100,
                distribution: pointDistribution
            },
            diceAnalysis: {
                frequency: diceFrequency,
                mostCommon: diceSorted.slice(0, 3).map(([v, c]) => ({ value: parseInt(v), count: c })),
                leastCommon: diceSorted.slice(-3).map(([v, c]) => ({ value: parseInt(v), count: c }))
            },
            streakAnalysis: {
                current: tempStreak,
                currentType: results[0],
                longestTai,
                longestXiu
            }
        }
    });
});

// API Clear history
app.post('/api/clear-history', (req, res) => {
    predictionHistory = [];
    res.json({
        status: 'success',
        message: 'Đã xóa lịch sử dự đoán'
    });
});

// API Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        sessionsLoaded: sessionData.length,
        predictionsTotal: predictionHistory.length,
        predictor: {
            name: 'VanHoa CSKHToolHehe Premium',
            version: predictor.version,
            algorithm: predictor.algorithmName
        },
        sourceAPI: API_URL
    });
});

// API Raw data từ API gốc
app.get('/api/raw', async (req, res) => {
    try {
        const response = await axios.get(API_URL, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Không thể lấy dữ liệu từ API gốc'
        });
    }
});

// ==================== CRON JOBS ====================
cron.schedule('*/30 * * * * *', async () => {
    await fetchSessionData();
    updatePredictionResults();
});

cron.schedule('*/10 * * * * *', () => {
    updatePredictionResults();
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found'
    });
});

app.use((err, req, res, next) => {
    console.error('[PREMIUM] Server Error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error'
    });
});

// ==================== START SERVER ====================
async function startServer() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   🎲 TÀI XỈU AI PREDICTOR PREMIUM v3.0      ║');
    console.log('║   👑 VanHoa CSKHToolHehe Premium Edition    ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log(`📡 API Gốc: ${API_URL}`);
    console.log('🔄 Đang fetch dữ liệu ban đầu...');
    
    await fetchSessionData();
    
    app.listen(PORT, () => {
        console.log(`✅ Server: http://localhost:${PORT}`);
        console.log(`🎯 Dự đoán: http://localhost:${PORT}/vanhoa`);
        console.log(`📊 API: http://localhost:${PORT}/api/predict`);
        console.log(`📝 Lịch sử: http://localhost:${PORT}/api/history`);
        console.log(`📈 Phân tích: http://localhost:${PORT}/api/analysis`);
        console.log(`🔄 Auto update mỗi ${FETCH_INTERVAL/1000}s`);
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║   👑 PREMIUM SYSTEM READY - VANHOA TOOL     ║');
        console.log('╚══════════════════════════════════════════════╝');
    });
}

startServer().catch(err => {
    console.error('[FATAL] Không thể khởi động server:', err);
    process.exit(1);
});
