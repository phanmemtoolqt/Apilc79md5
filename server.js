const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API gốc của bạn
const API_GOC = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';

// Lưu lịch sử dự đoán
let predictionHistory = [];
const MAX_HISTORY = 20;

// ==================== HÀM LẤY DỮ LIỆU TRỰC TIẾP TỪ API GỐC ====================
async function getSessionData() {
    try {
        const response = await axios.get(API_GOC, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        });
        if (response.data && response.data.list) {
            return response.data.list.sort((a, b) => b.id - a.id);
        }
    } catch (error) {
        console.error('Lỗi lấy API gốc:', error.message);
    }
    return [];
}

// ==================== AI DỰ ĐOÁN ====================
function predict(sessions) {
    if (!sessions || sessions.length < 3) {
        return { prediction: 'TAI', confidence: 50, taiProbability: 50, xiuProbability: 50 };
    }

    const results = sessions.map(s => s.resultTruyenThong);
    const points = sessions.map(s => s.point);
    const dices = sessions.flatMap(s => s.dices);

    let scores = { TAI: 0, XIU: 0 };

    // 1. Tỉ lệ Tài/Xỉu
    const taiCount = results.filter(r => r === 'TAI').length;
    const xiuCount = results.filter(r => r === 'XIU').length;
    const taiRatio = taiCount / results.length;

    if (taiRatio > 0.6) scores.XIU += 25;
    else if (taiRatio < 0.4) scores.TAI += 25;
    else if (taiRatio > 0.55) scores.XIU += 15;
    else if (taiRatio < 0.45) scores.TAI += 15;
    else { scores.TAI += 10; scores.XIU += 10; }

    // 2. Streak
    let streak = 1;
    const currentType = results[0];
    for (let i = 1; i < results.length; i++) {
        if (results[i] === currentType) streak++;
        else break;
    }

    if (streak >= 5) {
        if (currentType === 'TAI') scores.XIU += 30;
        else scores.TAI += 30;
    } else if (streak >= 3) {
        if (currentType === 'TAI') scores.XIU += 20;
        else scores.TAI += 20;
    } else if (streak >= 2) {
        if (currentType === 'TAI') scores.TAI += 15;
        else scores.XIU += 15;
    }

    // 3. Điểm trung bình
    const avgPoint = points.reduce((a, b) => a + b, 0) / points.length;
    if (avgPoint > 11.5) scores.XIU += 20;
    else if (avgPoint < 9.5) scores.TAI += 20;
    else if (avgPoint > 11) scores.XIU += 10;
    else if (avgPoint < 10) scores.TAI += 10;

    // 4. Xúc xắc
    const diceFreq = {};
    dices.forEach(d => diceFreq[d] = (diceFreq[d] || 0) + 1);
    const highDice = (diceFreq[4] || 0) + (diceFreq[5] || 0) + (diceFreq[6] || 0);
    const lowDice = (diceFreq[1] || 0) + (diceFreq[2] || 0) + (diceFreq[3] || 0);

    if (highDice > lowDice * 1.3) scores.TAI += 15;
    else if (lowDice > highDice * 1.3) scores.XIU += 15;

    // 5. Pattern 3 gần nhất
    if (results.length >= 3) {
        const last3 = results.slice(0, 3).map(r => r === 'TAI' ? 'T' : 'X').join('');
        const patterns = {
            'TTT': { XIU: 25 },
            'XXX': { TAI: 25 },
            'TTX': { XIU: 18 },
            'XXT': { TAI: 18 },
            'TXX': { TAI: 15 },
            'XTT': { XIU: 15 }
        };
        if (patterns[last3]) {
            if (patterns[last3].TAI) scores.TAI += patterns[last3].TAI;
            if (patterns[last3].XIU) scores.XIU += patterns[last3].XIU;
        }
    }

    const totalScore = scores.TAI + scores.XIU;
    const prediction = scores.TAI >= scores.XIU ? 'TAI' : 'XIU';
    const confidence = Math.round((Math.max(scores.TAI, scores.XIU) / totalScore) * 10000) / 100;
    const taiProbability = Math.round((scores.TAI / totalScore) * 10000) / 100;
    const xiuProbability = Math.round((scores.XIU / totalScore) * 10000) / 100;

    return {
        prediction,
        confidence: Math.min(confidence, 99.99),
        taiProbability,
        xiuProbability,
        analysis: {
            totalSamples: results.length,
            taiCount,
            xiuCount,
            currentStreak: streak,
            currentType,
            avgPoint: Math.round(avgPoint * 100) / 100,
            balanceRatio: Math.round(taiRatio * 100) / 100
        }
    };
}

// Cập nhật kết quả dự đoán cũ
async function updateHistoryResults() {
    const sessions = await getSessionData();
    if (!sessions.length) return;

    predictionHistory.forEach(pred => {
        if (pred.status === 'pending') {
            const session = sessions.find(s => s.id === pred.sessionId);
            if (session) {
                pred.actualResult = session.resultTruyenThong;
                pred.actualDices = session.dices;
                pred.actualPoint = session.point;
                pred.status = 'completed';
                pred.isCorrect = pred.prediction === pred.actualResult;
            }
        }
    });
}

// ==================== ROUTES ====================

// API chính - /vanhoa
app.get('/vanhoa', async (req, res) => {
    try {
        // Lấy dữ liệu trực tiếp từ API gốc
        const sessions = await getSessionData();

        if (!sessions.length) {
            return res.status(500).json({
                status: 'error',
                message: 'Không lấy được dữ liệu từ API gốc: ' + API_GOC
            });
        }

        // Dự đoán
        const prediction = predict(sessions);

        // Lấy phiên mới nhất
        const latestSession = sessions[0];
        const nextSessionId = latestSession ? latestSession.id + 1 : null;

        // Lưu vào lịch sử
        const record = {
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
            isCorrect: null
        };

        predictionHistory.push(record);
        if (predictionHistory.length > MAX_HISTORY) {
            predictionHistory = predictionHistory.slice(-MAX_HISTORY);
        }

        // Cập nhật kết quả cũ
        await updateHistoryResults();

        // Tính độ chính xác
        const completed = predictionHistory.filter(p => p.status === 'completed');
        const correct = completed.filter(p => p.isCorrect).length;
        const accuracy = completed.length > 0 ? Math.round((correct / completed.length) * 10000) / 100 : 0;

        res.json({
            status: 'success',
            timestamp: new Date().toISOString(),
            sourceAPI: API_GOC,
            data: {
                nextSessionId,
                prediction: prediction.prediction,
                confidence: prediction.confidence,
                taiProbability: prediction.taiProbability,
                xiuProbability: prediction.xiuProbability,
                analysis: prediction.analysis,
                latestSession: {
                    id: latestSession.id,
                    result: latestSession.resultTruyenThong,
                    dices: latestSession.dices,
                    point: latestSession.point
                },
                history: {
                    total: predictionHistory.length,
                    completed: completed.length,
                    correct,
                    incorrect: completed.length - correct,
                    accuracy,
                    predictions: predictionHistory.slice().reverse()
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Lỗi server: ' + error.message
        });
    }
});

// API lịch sử
app.get('/api/history', async (req, res) => {
    await updateHistoryResults();

    const completed = predictionHistory.filter(p => p.status === 'completed');
    const correct = completed.filter(p => p.isCorrect).length;
    const accuracy = completed.length > 0 ? Math.round((correct / completed.length) * 10000) / 100 : 0;

    res.json({
        status: 'success',
        data: {
            predictions: predictionHistory.slice().reverse(),
            total: predictionHistory.length,
            completed: completed.length,
            pending: predictionHistory.filter(p => p.status === 'pending').length,
            correct,
            incorrect: completed.length - correct,
            accuracy
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        sourceAPI: API_GOC,
        historyCount: predictionHistory.length
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found. Dùng /vanhoa hoặc /api/history'
    });
});

// Start
app.listen(PORT, () => {
    console.log(`Server chạy port ${PORT}`);
    console.log(`API Gốc: ${API_GOC}`);
    console.log(`Dự đoán: http://localhost:${PORT}/vanhoa`);
    console.log(`Lịch sử: http://localhost:${PORT}/api/history`);
});
