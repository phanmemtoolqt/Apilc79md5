// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

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
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // giới hạn 100 request mỗi IP
    message: { status: 'error', message: 'Quá nhiều request, vui lòng thử lại sau' }
});
app.use('/api/', limiter);

// ==================== DATA STORAGE ====================
let sessionData = [];
let predictionHistory = [];
let lastFetchTime = null;
const MAX_HISTORY = 20;
const FETCH_INTERVAL = 30000; // 30 giây

// ==================== AI PREDICTOR CLASS ====================
class AIDicePredictor {
    constructor() {
        this.version = '2.0.0';
        this.algorithmName = 'DeepPatternAI';
        this.weights = {
            balanceAnalysis: 0.25,    // Phân tích cân bằng
            streakAnalysis: 0.20,     // Phân tích chuỗi
            pointAnalysis: 0.20,      // Phân tích điểm số
            diceAnalysis: 0.20,       // Phân tích xúc xắc
            patternAnalysis: 0.15     // Phân tích mẫu
        };
    }

    // Phân tích toàn diện
    analyzeComprehensive(history) {
        if (!history || history.length < 5) {
            return this.getDefaultPrediction();
        }

        const recentHistory = history.slice(0, Math.min(history.length, 100));
        const results = recentHistory.map(item => item.resultTruyenThong);
        const points = recentHistory.map(item => item.point);
        const dices = recentHistory.flatMap(item => item.dices);

        // 1. Phân tích cân bằng Tài/Xỉu
        const balanceAnalysis = this.analyzeBalance(results);
        
        // 2. Phân tích chuỗi (streak)
        const streakAnalysis = this.analyzeStreak(results);
        
        // 3. Phân tích điểm số
        const pointAnalysis = this.analyzePoints(points);
        
        // 4. Phân tích xúc xắc
        const diceAnalysis = this.analyzeDicePattern(dices);
        
        // 5. Phân tích mẫu gần nhất
        const patternAnalysis = this.analyzeRecentPattern(results);
        
        // 6. Phân tích nâng cao
        const advancedAnalysis = this.analyzeAdvanced(recentHistory);

        // Tổng hợp điểm
        const scores = {
            TAI: 0,
            XIU: 0
        };

        // Áp dụng trọng số
        this.addWeightedScore(scores, balanceAnalysis, this.weights.balanceAnalysis);
        this.addWeightedScore(scores, streakAnalysis, this.weights.streakAnalysis);
        this.addWeightedScore(scores, pointAnalysis, this.weights.pointAnalysis);
        this.addWeightedScore(scores, diceAnalysis, this.weights.diceAnalysis);
        this.addWeightedScore(scores, patternAnalysis, this.weights.patternAnalysis);
        
        // Thêm điểm từ phân tích nâng cao
        if (advancedAnalysis.TAI > 0) scores.TAI += advancedAnalysis.TAI;
        if (advancedAnalysis.XIU > 0) scores.XIU += advancedAnalysis.XIU;

        const totalScore = scores.TAI + scores.XIU;
        const prediction = scores.TAI >= scores.XIU ? 'TAI' : 'XIU';
        const confidence = totalScore > 0 ? (Math.max(scores.TAI, scores.XIU) / totalScore) * 100 : 50;
        
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
                taiCount: results.filter(r => r === 'TAI').length,
                xiuCount: results.filter(r => r === 'XIU').length,
                currentStreak: streakAnalysis.streak,
                currentType: streakAnalysis.currentType,
                avgPoint: Math.round(pointAnalysis.avgPoint * 100) / 100,
                mostCommonDice: this.getMostCommonDice(dices),
                algorithm: this.algorithmName,
                version: this.version
            },
            advancedMetrics: {
                balanceScore: balanceAnalysis,
                streakScore: streakAnalysis,
                pointScore: pointAnalysis,
                diceScore: diceAnalysis,
                patternScore: patternAnalysis,
                advancedScore: advancedAnalysis
            }
        };
    }

    // Phân tích cân bằng
    analyzeBalance(results) {
        const total = results.length;
        const taiCount = results.filter(r => r === 'TAI').length;
        const xiuCount = results.filter(r => r === 'XIU').length;
        
        const taiRatio = taiCount / total;
        const scores = { TAI: 0, XIU: 0 };
        
        if (taiRatio > 0.6) {
            scores.XIU = 30; // Quá nhiều Tài -> dự đoán Xỉu
        } else if (taiRatio < 0.4) {
            scores.TAI = 30; // Quá nhiều Xỉu -> dự đoán Tài
        } else if (taiRatio > 0.55) {
            scores.XIU = 20;
        } else if (taiRatio < 0.45) {
            scores.TAI = 20;
        } else {
            scores.TAI = 15;
            scores.XIU = 15;
        }
        
        return { ...scores, ratio: taiRatio, total, taiCount, xiuCount };
    }

    // Phân tích chuỗi liên tiếp
    analyzeStreak(results) {
        if (results.length === 0) return { TAI: 0, XIU: 0, streak: 0, currentType: null };
        
        let streak = 1;
        const currentType = results[0]; // Phần tử đầu tiên là mới nhất
        
        for (let i = 1; i < results.length; i++) {
            if (results[i] === currentType) {
                streak++;
            } else {
                break;
            }
        }
        
        const scores = { TAI: 0, XIU: 0 };
        
        if (streak >= 5) {
            // Streak dài -> khả năng đảo chiều cao
            if (currentType === 'TAI') scores.XIU = 35;
            else scores.TAI = 35;
        } else if (streak >= 3) {
            if (currentType === 'TAI') scores.XIU = 25;
            else scores.TAI = 25;
        } else if (streak >= 2) {
            // Streak ngắn -> có thể tiếp tục
            if (currentType === 'TAI') scores.TAI = 20;
            else scores.XIU = 20;
        }
        
        return { ...scores, streak, currentType };
    }

    // Phân tích điểm số
    analyzePoints(points) {
        if (points.length === 0) return { TAI: 0, XIU: 0, avgPoint: 0 };
        
        const avgPoint = points.reduce((a, b) => a + b, 0) / points.length;
        const scores = { TAI: 0, XIU: 0 };
        
        if (avgPoint > 11.5) {
            scores.XIU = 25;
        } else if (avgPoint < 9.5) {
            scores.TAI = 25;
        } else if (avgPoint > 11) {
            scores.XIU = 15;
        } else if (avgPoint < 10) {
            scores.TAI = 15;
        } else {
            scores.TAI = 12;
            scores.XIU = 12;
        }
        
        return { ...scores, avgPoint };
    }

    // Phân tích mẫu xúc xắc
    analyzeDicePattern(dices) {
        if (dices.length === 0) return { TAI: 0, XIU: 0 };
        
        const frequency = {};
        dices.forEach(d => frequency[d] = (frequency[d] || 0) + 1);
        
        const scores = { TAI: 0, XIU: 0 };
        const dice6Count = frequency[6] || 0;
        const dice1Count = frequency[1] || 0;
        const totalDice = dices.length;
        
        if (dice6Count > totalDice * 0.25) {
            scores.TAI = 20;
        } else if (dice1Count > totalDice * 0.25) {
            scores.XIU = 20;
        }
        
        // Phân tích cặp đôi
        const highDice = (frequency[4] || 0) + (frequency[5] || 0) + (frequency[6] || 0);
        const lowDice = (frequency[1] || 0) + (frequency[2] || 0) + (frequency[3] || 0);
        
        if (highDice > lowDice * 1.3) {
            scores.TAI += 15;
        } else if (lowDice > highDice * 1.3) {
            scores.XIU += 15;
        }
        
        return { ...scores, dice6Count, dice1Count, frequency };
    }

    // Phân tích mẫu gần nhất
    analyzeRecentPattern(results) {
        if (results.length < 3) return { TAI: 0, XIU: 0 };
        
        const last3 = results.slice(0, 3);
        const pattern = last3.map(r => r === 'TAI' ? 'T' : 'X').join('');
        
        const scores = { TAI: 0, XIU: 0 };
        
        const patternWeights = {
            'TTT': { XIU: 30 },     // 3 Tài -> đảo chiều Xỉu
            'XXX': { TAI: 30 },     // 3 Xỉu -> đảo chiều Tài
            'TTX': { XIU: 20 },     // 2 Tài 1 Xỉu -> tiếp tục Xỉu
            'XXT': { TAI: 20 },     // 2 Xỉu 1 Tài -> tiếp tục Tài
            'TXT': { TAI: 15, XIU: 10 },
            'XTX': { XIU: 15, TAI: 10 },
            'TXX': { TAI: 18 },
            'XTT': { XIU: 18 }
        };
        
        if (patternWeights[pattern]) {
            Object.assign(scores, patternWeights[pattern]);
        }
        
        return { ...scores, pattern };
    }

    // Phân tích nâng cao
    analyzeAdvanced(history) {
        const scores = { TAI: 0, XIU: 0 };
        
        if (history.length < 5) return scores;
        
        // Phân tích chu kỳ
        const results = history.map(h => h.resultTruyenThong);
        const points = history.map(h => h.point);
        
        // Tìm chu kỳ lặp lại
        let cycles = 0;
        for (let i = 1; i < Math.min(results.length, 20); i++) {
            if (results[i] !== results[i-1]) cycles++;
        }
        
        // Nhiều chu kỳ thay đổi -> khả năng tiếp tục thay đổi
        if (cycles > 10) {
            if (results[0] === 'TAI') scores.XIU = 15;
            else scores.TAI = 15;
        }
        
        // Phân tích độ lệch chuẩn
        if (points.length >= 10) {
            const avg = points.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
            const variance = points.slice(0, 10).reduce((a, b) => a + Math.pow(b - avg, 2), 0) / 10;
            const stdDev = Math.sqrt(variance);
            
            if (stdDev < 2) {
                // Ít biến động -> dễ dự đoán hơn
                if (avg > 10.5) scores.XIU += 10;
                else if (avg < 10.5) scores.TAI += 10;
            }
        }
        
        return scores;
    }

    // Helper methods
    addWeightedScore(target, source, weight) {
        if (source.TAI) target.TAI += source.TAI * weight;
        if (source.XIU) target.XIU += source.XIU * weight;
    }

    getMostCommonDice(dices) {
        const freq = {};
        dices.forEach(d => freq[d] = (freq[d] || 0) + 1);
        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
        return sorted.slice(0, 3).map(([value, count]) => ({ value: parseInt(value), count }));
    }

    getDefaultPrediction() {
        return {
            prediction: Math.random() > 0.5 ? 'TAI' : 'XIU',
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
                mostCommonDice: [],
                algorithm: this.algorithmName,
                version: this.version
            }
        };
    }
}

// Khởi tạo predictor
const predictor = new AIDicePredictor();

// ==================== API FUNCTIONS ====================
async function fetchSessionData() {
    try {
        const response = await axios.get('https://wtxmd52.tele68.com/v1/txmd5/sessions', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'vi-VN,vi;q=0.9'
            }
        });

        if (response.data && response.data.list) {
            sessionData = response.data.list.sort((a, b) => b.id - a.id);
            lastFetchTime = new Date();
            console.log(`✅ Đã cập nhật ${sessionData.length} phiên lúc ${lastFetchTime.toISOString()}`);
            return true;
        }
    } catch (error) {
        console.error('❌ Lỗi fetch dữ liệu:', error.message);
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
                pred.status = 'completed';
                pred.isCorrect = pred.prediction === pred.actualResult;
                pred.completedAt = new Date().toISOString();
                
                console.log(`✅ Cập nhật dự đoán #${pred.sessionId}: Dự đoán ${pred.prediction}, Kết quả ${pred.actualResult} -> ${pred.isCorrect ? 'ĐÚNG' : 'SAI'}`);
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

// Trang chủ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
                message: 'Không thể lấy dữ liệu từ server'
            });
        }

        // Phân tích và dự đoán
        const recentSessions = sessionData.slice(0, 100);
        const prediction = predictor.analyzeComprehensive(recentSessions);
        
        // Lấy phiên mới nhất
        const latestSession = sessionData[0];
        const nextSessionId = latestSession ? latestSession.id + 1 : null;

        // Lưu vào lịch sử
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
            isCorrect: null
        };

        predictionHistory.push(predictionRecord);

        // Giới hạn lịch sử
        if (predictionHistory.length > MAX_HISTORY) {
            predictionHistory = predictionHistory.slice(-MAX_HISTORY);
        }

        // Cập nhật kết quả cũ
        updatePredictionResults();

        res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                nextSessionId,
                prediction: prediction.prediction,
                confidence: prediction.confidence,
                taiProbability: prediction.taiProbability,
                xiuProbability: prediction.xiuProbability,
                scores: prediction.scores,
                analysis: prediction.analysis,
                advancedMetrics: prediction.advancedMetrics,
                latestSessions: sessionData.slice(0, 5).map(s => ({
                    id: s.id,
                    result: s.resultTruyenThong,
                    dices: s.dices,
                    point: s.point
                }))
            }
        });

    } catch (error) {
        console.error('Lỗi predict:', error);
        res.status(500).json({
            status: 'error',
            message: 'Lỗi server: ' + error.message
        });
    }
});

// API Lịch sử dự đoán
app.get('/api/history', (req, res) => {
    updatePredictionResults();
    
    res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        data: {
            predictions: predictionHistory,
            totalPredictions: predictionHistory.length,
            completedPredictions: predictionHistory.filter(p => p.status === 'completed').length,
            pendingPredictions: predictionHistory.filter(p => p.status === 'pending').length,
            accuracy: calculateAccuracy(),
            stats: {
                totalCorrect: predictionHistory.filter(p => p.isCorrect === true).length,
                totalIncorrect: predictionHistory.filter(p => p.isCorrect === false).length,
                avgConfidence: predictionHistory.length > 0 
                    ? Math.round(predictionHistory.reduce((a, b) => a + b.confidence, 0) / predictionHistory.length * 100) / 100
                    : 0
            }
        }
    });
});

// API Dữ liệu mới nhất
app.get('/api/latest', async (req, res) => {
    await fetchSessionData();
    
    res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        lastUpdated: lastFetchTime ? lastFetchTime.toISOString() : null,
        data: sessionData.slice(0, 20).map(s => ({
            id: s.id,
            resultTruyenThong: s.resultTruyenThong,
            dices: s.dices,
            point: s.point
        })),
        stats: {
            total: sessionData.length,
            taiCount: sessionData.filter(s => s.resultTruyenThong === 'TAI').length,
            xiuCount: sessionData.filter(s => s.resultTruyenThong === 'XIU').length
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

    const analysis = {
        totalSessions: sessionData.length,
        resultDistribution: {
            TAI: results.filter(r => r === 'TAI').length,
            XIU: results.filter(r => r === 'XIU').length
        },
        pointAnalysis: {
            min: Math.min(...points),
            max: Math.max(...points),
            average: Math.round(points.reduce((a, b) => a + b, 0) / points.length * 100) / 100,
            distribution: {}
        },
        diceAnalysis: {
            frequency: {},
            mostCommon: [],
            leastCommon: []
        },
        streakAnalysis: {
            current: 0,
            longestTai: 0,
            longestXiu: 0
        }
    };

    // Phân phối điểm
    for (let i = 3; i <= 18; i++) {
        analysis.pointAnalysis.distribution[i] = points.filter(p => p === i).length;
    }

    // Tần suất xúc xắc
    for (let i = 1; i <= 6; i++) {
        analysis.diceAnalysis.frequency[i] = dices.filter(d => d === i).length;
    }

    const diceSorted = Object.entries(analysis.diceAnalysis.frequency)
        .sort((a, b) => b[1] - a[1]);
    
    analysis.diceAnalysis.mostCommon = diceSorted.slice(0, 3).map(([v, c]) => ({ value: parseInt(v), count: c }));
    analysis.diceAnalysis.leastCommon = diceSorted.slice(-3).map(([v, c]) => ({ value: parseInt(v), count: c }));

    // Streak analysis
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
    
    analysis.streakAnalysis.current = tempStreak;
    analysis.streakAnalysis.currentType = results[0];
    analysis.streakAnalysis.longestTai = longestTai;
    analysis.streakAnalysis.longestXiu = longestXiu;

    res.json({
        status: 'success',
        data: analysis
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
        predictor: {
            version: predictor.version,
            algorithm: predictor.algorithmName
        }
    });
});

// ==================== CRON JOBS ====================
// Tự động fetch dữ liệu mỗi 30 giây
cron.schedule('*/30 * * * * *', async () => {
    await fetchSessionData();
    updatePredictionResults();
});

// Tự động cập nhật kết quả dự đoán mỗi 10 giây
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
    console.error('Server Error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error'
    });
});

// ==================== START SERVER ====================
async function startServer() {
    console.log('🚀 Khởi động Tài Xỉu AI Predictor...');
    console.log('📡 Đang fetch dữ liệu ban đầu...');
    
    await fetchSessionData();
    
    app.listen(PORT, () => {
        console.log(`✅ Server đang chạy tại: http://localhost:${PORT}`);
        console.log(`🎯 API Dự đoán: http://localhost:${PORT}/api/predict`);
        console.log(`📊 API Lịch sử: http://localhost:${PORT}/api/history`);
        console.log(`📈 API Phân tích: http://localhost:${PORT}/api/analysis`);
        console.log(`🔄 Tự động cập nhật mỗi ${FETCH_INTERVAL/1000} giây`);
    });
}

startServer().catch(console.error);
