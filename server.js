const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==================== CONFIG ====================
const API_GOC = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
let predictionHistory = [];
const MAX_HISTORY = 20;

// ==================== FETCH API GỐC ====================
async function fetchSessions() {
    try {
        const res = await axios.get(API_GOC, { timeout: 10000 });
        if (res.data && res.data.list) {
            return res.data.list.sort((a, b) => b.id - a.id);
        }
    } catch (e) {
        console.error('Lỗi fetch API gốc:', e.message);
    }
    return [];
}

// ==================== PHÂN TÍCH PATTERN ====================
function getPatterns(results) {
    const arr = results.map(r => r === 'TAI' ? 'T' : 'X');
    return {
        full: arr.join(''),
        last3: arr.slice(0, 3).join(''),
        last5: arr.slice(0, 5).join(''),
        last7: arr.slice(0, 7).join(''),
        last10: arr.slice(0, 10).join(''),
        last20: arr.slice(0, 20).join('')
    };
}

// ==================== THUẬT TOÁN DỰ ĐOÁN VIP ====================
function predictVIP(sessions) {
    if (!sessions || sessions.length < 5) {
        return {
            prediction: Math.random() > 0.5 ? 'TAI' : 'XIU',
            confidence: 50,
            taiProbability: 50,
            xiuProbability: 50,
            analysis: {
                totalSamples: sessions.length,
                taiCount: 0, xiuCount: 0,
                currentStreak: 0, currentType: null,
                avgPoint: 0, patterns: {}
            }
        };
    }

    const results = sessions.map(s => s.resultTruyenThong);
    const points = sessions.map(s => s.point);
    const dices = sessions.flatMap(s => s.dices);
    const patterns = getPatterns(results);

    let scores = { TAI: 0, XIU: 0 };
    let reasons = [];
    let weightDetails = {};

    // ========== 1. PHÂN TÍCH CÂN BẰNG (20%) ==========
    const taiCount = results.filter(r => r === 'TAI').length;
    const xiuCount = results.filter(r => r === 'XIU').length;
    const taiRatio = taiCount / results.length;
    
    if (taiRatio > 0.7) {
        scores.XIU += 30; reasons.push('Tài áp đảo >70% -> đảo Xỉu');
        weightDetails.balance = { score: 30, side: 'XIU', reason: 'Tài >70%' };
    } else if (taiRatio < 0.3) {
        scores.TAI += 30; reasons.push('Xỉu áp đảo >70% -> đảo Tài');
        weightDetails.balance = { score: 30, side: 'TAI', reason: 'Xỉu >70%' };
    } else if (taiRatio > 0.6) {
        scores.XIU += 22; reasons.push('Tài nhiều 60-70% -> nghiêng Xỉu');
        weightDetails.balance = { score: 22, side: 'XIU', reason: 'Tài 60-70%' };
    } else if (taiRatio < 0.4) {
        scores.TAI += 22; reasons.push('Xỉu nhiều 60-70% -> nghiêng Tài');
        weightDetails.balance = { score: 22, side: 'TAI', reason: 'Xỉu 60-70%' };
    } else if (taiRatio > 0.55) {
        scores.XIU += 14; reasons.push('Tài hơi nhiều 55-60%');
        weightDetails.balance = { score: 14, side: 'XIU', reason: 'Tài 55-60%' };
    } else if (taiRatio < 0.45) {
        scores.TAI += 14; reasons.push('Xỉu hơi nhiều 55-60%');
        weightDetails.balance = { score: 14, side: 'TAI', reason: 'Xỉu 55-60%' };
    } else {
        scores.TAI += 10; scores.XIU += 10;
        weightDetails.balance = { score: 10, side: 'BOTH', reason: 'Cân bằng' };
    }

    // ========== 2. PHÂN TÍCH STREAK (20%) ==========
    let streak = 1;
    const currentType = results[0];
    for (let i = 1; i < results.length; i++) {
        if (results[i] === currentType) streak++;
        else break;
    }
    
    if (streak >= 7) {
        scores[currentType === 'TAI' ? 'XIU' : 'TAI'] += 35;
        reasons.push(`Streak ${streak} ${currentType} -> đảo chiều mạnh`);
        weightDetails.streak = { score: 35, side: currentType === 'TAI' ? 'XIU' : 'TAI', reason: `Streak ${streak} đảo chiều` };
    } else if (streak >= 5) {
        scores[currentType === 'TAI' ? 'XIU' : 'TAI'] += 28;
        reasons.push(`Streak ${streak} ${currentType} -> khả năng đảo chiều`);
        weightDetails.streak = { score: 28, side: currentType === 'TAI' ? 'XIU' : 'TAI', reason: `Streak ${streak}` };
    } else if (streak >= 3) {
        scores[currentType === 'TAI' ? 'XIU' : 'TAI'] += 20;
        reasons.push(`Streak ${streak} ${currentType} -> có thể đảo chiều`);
        weightDetails.streak = { score: 20, side: currentType === 'TAI' ? 'XIU' : 'TAI', reason: `Streak ${streak}` };
    } else if (streak >= 2) {
        scores[currentType] += 16;
        reasons.push(`Streak ${streak} ${currentType} -> tiếp tục trend`);
        weightDetails.streak = { score: 16, side: currentType, reason: `Streak ${streak} tiếp tục` };
    } else {
        weightDetails.streak = { score: 0, side: 'NONE', reason: 'Không streak' };
    }

    // ========== 3. PHÂN TÍCH PATTERN (20%) ==========
    const p3 = patterns.last3;
    const p5 = patterns.last5;
    const p7 = patterns.last7;
    
    const p3Weights = {
        'TTT': { side: 'XIU', score: 25, reason: '3 Tài -> đảo Xỉu' },
        'XXX': { side: 'TAI', score: 25, reason: '3 Xỉu -> đảo Tài' },
        'TTX': { side: 'XIU', score: 18, reason: '2 Tài 1 Xỉu -> Xỉu' },
        'XXT': { side: 'TAI', score: 18, reason: '2 Xỉu 1 Tài -> Tài' },
        'TXT': { side: 'TAI', score: 12, reason: 'Tài Xỉu Tài -> Tài' },
        'XTX': { side: 'XIU', score: 12, reason: 'Xỉu Tài Xỉu -> Xỉu' },
        'TXX': { side: 'TAI', score: 15, reason: 'Tài Xỉu Xỉu -> Tài' },
        'XTT': { side: 'XIU', score: 15, reason: 'Xỉu Tài Tài -> Xỉu' }
    };
    
    if (p3Weights[p3]) {
        scores[p3Weights[p3].side] += p3Weights[p3].score;
        reasons.push(`Pattern 3: ${p3} -> ${p3Weights[p3].reason}`);
        weightDetails.pattern3 = p3Weights[p3];
    }

    const p5Weights = {
        'TTTTT': { side: 'XIU', score: 20, reason: '5 Tài -> đảo Xỉu' },
        'XXXXX': { side: 'TAI', score: 20, reason: '5 Xỉu -> đảo Tài' },
        'TTTTX': { side: 'XIU', score: 16, reason: '4 Tài 1 Xỉu -> Xỉu' },
        'XXXXT': { side: 'TAI', score: 16, reason: '4 Xỉu 1 Tài -> Tài' },
        'TTTXX': { side: 'XIU', score: 14, reason: '3 Tài 2 Xỉu -> Xỉu' },
        'XXXTT': { side: 'TAI', score: 14, reason: '3 Xỉu 2 Tài -> Tài' },
        'TTXTT': { side: 'TAI', score: 10, reason: 'Tài nhiều -> Tài' },
        'XXTXX': { side: 'XIU', score: 10, reason: 'Xỉu nhiều -> Xỉu' }
    };
    
    if (p5Weights[p5]) {
        scores[p5Weights[p5].side] += p5Weights[p5].score;
        reasons.push(`Pattern 5: ${p5} -> ${p5Weights[p5].reason}`);
        weightDetails.pattern5 = p5Weights[p5];
    }

    // Pattern 7 đặc biệt
    const p7Weights = {
        'TTTTTTT': { side: 'XIU', score: 25 },
        'XXXXXXX': { side: 'TAI', score: 25 },
        'TXTXTXT': { side: 'TAI', score: 12 },
        'XTXTXTX': { side: 'XIU', score: 12 }
    };
    if (p7Weights[p7]) {
        scores[p7Weights[p7].side] += p7Weights[p7].score;
        weightDetails.pattern7 = p7Weights[p7];
    }

    // ========== 4. PHÂN TÍCH ĐIỂM SỐ (20%) ==========
    const avgPoint = points.reduce((a, b) => a + b, 0) / points.length;
    const recentAvgPoint = points.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const pointVariance = points.slice(0, 20).reduce((a, b) => a + Math.pow(b - avgPoint, 2), 0) / 20;
    const pointStdDev = Math.sqrt(pointVariance);
    
    if (avgPoint > 12) {
        scores.XIU += 22; reasons.push(`Điểm TB cao ${avgPoint.toFixed(1)} -> Xỉu`);
        weightDetails.point = { score: 22, side: 'XIU', avgPoint: avgPoint.toFixed(1) };
    } else if (avgPoint < 9) {
        scores.TAI += 22; reasons.push(`Điểm TB thấp ${avgPoint.toFixed(1)} -> Tài`);
        weightDetails.point = { score: 22, side: 'TAI', avgPoint: avgPoint.toFixed(1) };
    } else if (avgPoint > 11.2) {
        scores.XIU += 14; reasons.push(`Điểm TB ${avgPoint.toFixed(1)} > 11.2`);
        weightDetails.point = { score: 14, side: 'XIU', avgPoint: avgPoint.toFixed(1) };
    } else if (avgPoint < 9.8) {
        scores.TAI += 14; reasons.push(`Điểm TB ${avgPoint.toFixed(1)} < 9.8`);
        weightDetails.point = { score: 14, side: 'TAI', avgPoint: avgPoint.toFixed(1) };
    } else {
        scores.TAI += 8; scores.XIU += 8;
        weightDetails.point = { score: 8, side: 'BOTH', avgPoint: avgPoint.toFixed(1) };
    }
    
    // Bonus: độ lệch chuẩn thấp -> dễ đoán hơn
    if (pointStdDev < 2.5) {
        if (recentAvgPoint > 10.5) scores.XIU += 10;
        else scores.TAI += 10;
        reasons.push(`Độ lệch chuẩn thấp ${pointStdDev.toFixed(2)} -> tăng độ tin cậy`);
        weightDetails.pointStdDev = { score: 10, stdDev: pointStdDev.toFixed(2) };
    }

    // ========== 5. PHÂN TÍCH XÚC XẮC (20%) ==========
    const diceFreq = {};
    dices.forEach(d => diceFreq[d] = (diceFreq[d] || 0) + 1);
    
    const recentDices = sessions.slice(0, 15).flatMap(s => s.dices);
    const recentDiceFreq = {};
    recentDices.forEach(d => recentDiceFreq[d] = (recentDiceFreq[d] || 0) + 1);
    
    const highDiceAll = (diceFreq[4] || 0) + (diceFreq[5] || 0) + (diceFreq[6] || 0);
    const lowDiceAll = (diceFreq[1] || 0) + (diceFreq[2] || 0) + (diceFreq[3] || 0);
    const highDiceRecent = (recentDiceFreq[4] || 0) + (recentDiceFreq[5] || 0) + (recentDiceFreq[6] || 0);
    const lowDiceRecent = (recentDiceFreq[1] || 0) + (recentDiceFreq[2] || 0) + (recentDiceFreq[3] || 0);
    
    // Xúc xắc toàn bộ
    if (highDiceAll > lowDiceAll * 1.5) {
        scores.TAI += 18; reasons.push('Xúc xắc cao áp đảo -> Tài');
        weightDetails.diceAll = { score: 18, side: 'TAI', high: highDiceAll, low: lowDiceAll };
    } else if (lowDiceAll > highDiceAll * 1.5) {
        scores.XIU += 18; reasons.push('Xúc xắc thấp áp đảo -> Xỉu');
        weightDetails.diceAll = { score: 18, side: 'XIU', high: highDiceAll, low: lowDiceAll };
    } else if (highDiceAll > lowDiceAll * 1.2) {
        scores.TAI += 10; reasons.push('Xúc xắc hơi cao -> Tài');
        weightDetails.diceAll = { score: 10, side: 'TAI', high: highDiceAll, low: lowDiceAll };
    } else if (lowDiceAll > highDiceAll * 1.2) {
        scores.XIU += 10; reasons.push('Xúc xắc hơi thấp -> Xỉu');
        weightDetails.diceAll = { score: 10, side: 'XIU', high: highDiceAll, low: lowDiceAll };
    }
    
    // Xúc xắc gần đây
    if (highDiceRecent > lowDiceRecent * 1.6) {
        scores.TAI += 12; reasons.push('Xúc xắc gần đây cao -> Tài');
        weightDetails.diceRecent = { score: 12, side: 'TAI' };
    } else if (lowDiceRecent > highDiceRecent * 1.6) {
        scores.XIU += 12; reasons.push('Xúc xắc gần đây thấp -> Xỉu');
        weightDetails.diceRecent = { score: 12, side: 'XIU' };
    }
    
    // Phân tích số 1 và 6 đặc biệt
    const dice1Ratio = (diceFreq[1] || 0) / dices.length;
    const dice6Ratio = (diceFreq[6] || 0) / dices.length;
    
    if (dice6Ratio > 0.22) {
        scores.TAI += 8; reasons.push('Nhiều số 6 (>22%)');
    }
    if (dice1Ratio > 0.22) {
        scores.XIU += 8; reasons.push('Nhiều số 1 (>22%)');
    }

    // ========== TỔNG HỢP ==========
    const totalScore = scores.TAI + scores.XIU;
    const prediction = scores.TAI >= scores.XIU ? 'TAI' : 'XIU';
    const confidence = Math.min(Math.round((Math.max(scores.TAI, scores.XIU) / totalScore) * 10000) / 100, 99.99);
    const taiProbability = Math.round((scores.TAI / totalScore) * 10000) / 100;
    const xiuProbability = Math.round((scores.XIU / totalScore) * 10000) / 100;

    // Đánh giá độ mạnh của dự đoán
    let strength = '';
    if (confidence >= 85) strength = 'RẤT MẠNH';
    else if (confidence >= 75) strength = 'MẠNH';
    else if (confidence >= 65) strength = 'KHÁ';
    else if (confidence >= 55) strength = 'TRUNG BÌNH';
    else strength = 'YẾU';

    return {
        prediction,
        confidence,
        taiProbability,
        xiuProbability,
        strength,
        scores,
        analysis: {
            totalSamples: results.length,
            taiCount,
            xiuCount,
            taiRatio: Math.round(taiRatio * 100) / 100,
            currentStreak: streak,
            currentType,
            avgPoint: Math.round(avgPoint * 100) / 100,
            recentAvgPoint: Math.round(recentAvgPoint * 100) / 100,
            pointStdDev: Math.round(pointStdDev * 100) / 100,
            patterns,
            reasons,
            weightDetails,
            diceAnalysis: {
                diceFreq,
                recentDiceFreq,
                highDiceAll,
                lowDiceAll,
                highDiceRecent,
                lowDiceRecent,
                dice1Ratio: Math.round(dice1Ratio * 100) / 100,
                dice6Ratio: Math.round(dice6Ratio * 100) / 100
            }
        }
    };
}

// ==================== CẬP NHẬT KẾT QUẢ ====================
async function updateResults() {
    const sessions = await fetchSessions();
    if (!sessions.length) return;
    
    predictionHistory.forEach(p => {
        if (p.trangThai === 'Đang chờ') {
            const found = sessions.find(s => s.id === p.phienDuDoan);
            if (found) {
                p.ketQuaThucTe = found.resultTruyenThong;
                p.dicesThucTe = found.dices;
                p.diemThucTe = found.point;
                p.trangThai = 'Đã hoàn thành';
                p.danhGia = p.duDoan === found.resultTruyenThong ? 'Đúng' : 'Sai';
                p.thoiGianHoanThanh = new Date().toISOString();
            }
        }
    });
}

// ==================== API: /vanhoa ====================
app.get('/vanhoa', async (req, res) => {
    try {
        const sessions = await fetchSessions();
        if (!sessions.length) {
            return res.json({ status: 'error', message: 'Không lấy được dữ liệu từ API gốc' });
        }

        await updateResults();
        const prediction = predictVIP(sessions);
        const latest = sessions[0];
        const nextId = latest.id + 1;

        const newPred = {
            id: predictionHistory.length + 1,
            phienDuDoan: nextId,
            duDoan: prediction.prediction,
            doTinCay: prediction.confidence,
            sucManh: prediction.strength,
            xacSuatTai: prediction.taiProbability,
            xacSuatXiu: prediction.xiuProbability,
            diemSo: prediction.scores,
            thoiGianDuDoan: new Date().toISOString(),
            trangThai: 'Đang chờ',
            ketQuaThucTe: null,
            dicesThucTe: null,
            diemThucTe: null,
            danhGia: null,
            thoiGianHoanThanh: null
        };

        predictionHistory.push(newPred);
        if (predictionHistory.length > MAX_HISTORY) {
            predictionHistory = predictionHistory.slice(-MAX_HISTORY);
        }

        const completed = predictionHistory.filter(p => p.trangThai === 'Đã hoàn thành');
        const correct = completed.filter(p => p.danhGia === 'Đúng').length;
        const incorrect = completed.filter(p => p.danhGia === 'Sai').length;

        // Tính streak đúng
        let correctStreak = 0;
        for (let i = predictionHistory.length - 1; i >= 0; i--) {
            if (predictionHistory[i].danhGia === 'Đúng') correctStreak++;
            else break;
        }

        res.json({
            status: 'success',
            thoiGian: new Date().toISOString(),
            banQuyen: 'VanHoa CSKHToolHehe Premium',
            phienHienTai: { id: latest.id, ketQua: latest.resultTruyenThong, dices: latest.dices, diem: latest.point },
            duDoan: {
                phienDuDoan: nextId,
                duDoan: prediction.prediction,
                doTinCay: prediction.confidence,
                sucManh: prediction.strength,
                xacSuatTai: prediction.taiProbability,
                xacSuatXiu: prediction.xiuProbability,
                phanTich: prediction.analysis
            },
            lichSu: {
                tongDuDoan: predictionHistory.length,
                daHoanThanh: completed.length,
                dangCho: predictionHistory.length - completed.length,
                soLanDung: correct,
                soLanSai: incorrect,
                doChinhXac: completed.length > 0 ? Math.round((correct / completed.length) * 10000) / 100 : 0,
                streakDungLienTiep: correctStreak,
                danhSach: predictionHistory.slice().reverse()
            }
        });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

// ==================== API: /api/history ====================
app.get('/api/history', async (req, res) => {
    await updateResults();
    const completed = predictionHistory.filter(p => p.trangThai === 'Đã hoàn thành');
    const correct = completed.filter(p => p.danhGia === 'Đúng').length;
    res.json({
        status: 'success',
        banQuyen: 'VanHoa CSKHToolHehe',
        lichSu: predictionHistory.slice().reverse(),
        thongKe: {
            tong: predictionHistory.length,
            dung: correct,
            sai: completed.length - correct,
            doChinhXac: completed.length > 0 ? Math.round((correct / completed.length) * 100) : 0
        }
    });
});

// ==================== API: /api/latest ====================
app.get('/api/latest', async (req, res) => {
    const sessions = await fetchSessions();
    await updateResults();
    const completed = predictionHistory.filter(p => p.trangThai === 'Đã hoàn thành');
    const correct = completed.filter(p => p.danhGia === 'Đúng').length;
    let correctStreak = 0;
    for (let i = predictionHistory.length - 1; i >= 0; i--) {
        if (predictionHistory[i].danhGia === 'Đúng') correctStreak++;
        else break;
    }
    res.json({
        status: 'success',
        phienMoiNhat: sessions[0] || null,
        lichSu: predictionHistory.slice().reverse(),
        thongKe: {
            tong: predictionHistory.length,
            dung: correct,
            sai: completed.length - correct,
            doChinhXac: completed.length > 0 ? Math.round((correct / completed.length) * 100) : 0,
            streakDung: correctStreak
        }
    });
});

// ==================== API: /api/raw ====================
app.get('/api/raw', async (req, res) => {
    const sessions = await fetchSessions();
    res.json({
        status: 'success',
        nguon: API_GOC,
        tongPhien: sessions.length,
        data: sessions.slice(0, 50)
    });
});

// ==================== API: /api/predict-only ====================
app.get('/api/predict-only', async (req, res) => {
    const sessions = await fetchSessions();
    if (!sessions.length) return res.json({ status: 'error', message: 'Không có dữ liệu' });
    const prediction = predictVIP(sessions);
    const latest = sessions[0];
    res.json({
        status: 'success',
        phienDuDoan: latest.id + 1,
        duDoan: prediction.prediction,
        doTinCay: prediction.confidence,
        sucManh: prediction.strength,
        xacSuatTai: prediction.taiProbability,
        xacSuatXiu: prediction.xiuProbability
    });
});

// ==================== HTML NHÚNG TRỰC TIẾP ====================
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VanHoa Tai Xiu AI Predictor VIP</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Be+Vietnam+Pro:wght@300;400;600;700;900&display=swap" rel="stylesheet">
    <style>
        :root{--bg:#06060f;--card:#0f0f1e;--gold:#f0c040;--tai:#ff3b5c;--xiu:#00e676;--blue:#448aff;--purple:#b388ff;--pink:#ff6b9d;--text:#e0e0e0;--border:#1e1e3a;--glow:0 0 20px}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Be Vietnam Pro',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
        body::before{content:'';position:fixed;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at 50% 0%,rgba(240,192,64,.08) 0%,transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(68,138,255,.06) 0%,transparent 60%);pointer-events:none;z-index:0}
        .container{max-width:1350px;margin:0 auto;padding:15px;position:relative;z-index:1}
        .header{text-align:center;padding:30px 0 20px;border-bottom:2px solid var(--border);margin-bottom:22px;position:relative}
        .header::after{content:'';position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);width:200px;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
        .header .logo{font-family:'Orbitron',sans-serif;font-size:3.2em;font-weight:900;background:linear-gradient(135deg,var(--gold),var(--pink),var(--purple),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:logoGlow 3s ease-in-out infinite;margin-bottom:5px}
        @keyframes logoGlow{0%,100%{filter:brightness(1) saturate(1)}50%{filter:brightness(1.4) saturate(1.3)}}
        .header .sub{font-size:1em;opacity:.7;letter-spacing:3px;text-transform:uppercase}
        .header .brand{display:inline-block;background:linear-gradient(135deg,var(--gold),#ff8c00);color:#000;padding:8px 22px;border-radius:30px;font-weight:800;font-size:.85em;margin-top:10px;letter-spacing:2px;box-shadow:0 0 20px rgba(240,192,64,.3)}
        .live-badge{display:inline-flex;align-items:center;gap:8px;background:#1a1a2e;padding:8px 18px;border-radius:25px;font-size:.8em;margin-left:10px;border:1px solid var(--border)}
        .live-dot{width:10px;height:10px;background:#00e676;border-radius:50%;animation:blink 1s infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        .grid{display:grid;grid-template-columns:1fr 1.2fr;gap:20px;margin-bottom:20px}
        @media(max-width:950px){.grid{grid-template-columns:1fr}}
        .card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:24px;transition:all .35s;position:relative;overflow:hidden}
        .card::before{content:'';position:absolute;top:0;left:0;width:100%;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:0;transition:opacity .35s}
        .card:hover::before{opacity:1}
        .card:hover{border-color:var(--gold);box-shadow:0 0 40px rgba(240,192,64,.08);transform:translateY(-2px)}
        .card-title{display:flex;align-items:center;gap:10px;margin-bottom:20px;font-family:'Orbitron',sans-serif;font-size:1.1em;color:var(--gold);letter-spacing:2px;text-transform:uppercase}
        .pred-box{text-align:center;padding:25px 0}
        .pred-val{font-family:'Orbitron',sans-serif;font-size:8em;font-weight:900;line-height:1;animation:bounceIn .6s ease}
        @keyframes bounceIn{0%{transform:scale(.3);opacity:0}50%{transform:scale(1.1)}70%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}
        .pred-tai{color:var(--tai);text-shadow:0 0 60px rgba(255,59,92,.7),0 0 120px rgba(255,59,92,.3)}
        .pred-xiu{color:var(--xiu);text-shadow:0 0 60px rgba(0,230,118,.7),0 0 120px rgba(0,230,118,.3)}
        .session-tag{font-size:1.2em;margin:8px 0;opacity:.85}
        .strength-badge{display:inline-block;padding:6px 18px;border-radius:20px;font-weight:700;font-size:.85em;letter-spacing:1px;margin:5px 0}
        .strength-strong{background:rgba(0,230,118,.2);color:#00e676;border:1px solid rgba(0,230,118,.4)}
        .strength-medium{background:rgba(240,192,64,.2);color:var(--gold);border:1px solid rgba(240,192,64,.4)}
        .strength-weak{background:rgba(255,59,92,.2);color:var(--tai);border:1px solid rgba(255,59,92,.4)}
        .conf-bar{background:#1a1a2e;border-radius:14px;height:38px;margin:18px 0;overflow:hidden;border:1px solid var(--border)}
        .conf-fill{height:100%;border-radius:14px;background:linear-gradient(90deg,var(--blue),var(--purple),var(--pink));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9em;transition:width 1s ease;position:relative}
        .conf-fill::after{content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);animation:shimmer 2s infinite}
        @keyframes shimmer{100%{left:100%}}
        .prob-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:15px 0}
        .prob-card{background:#1a1a2e;border-radius:14px;padding:18px;text-align:center;border:1px solid var(--border);transition:all .3s}
        .prob-card:hover{transform:translateY(-3px);border-color:var(--gold)}
        .prob-lbl{font-size:.85em;opacity:.7;margin-bottom:6px;text-transform:uppercase;letter-spacing:2px}
        .prob-num{font-family:'Orbitron',sans-serif;font-size:2.5em;font-weight:900}
        .prob-tai{color:var(--tai)}.prob-xiu{color:var(--xiu)}
        .tags-row{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;justify-content:center}
        .tag{background:#1a1a2e;padding:7px 16px;border-radius:22px;font-size:.8em;border:1px solid var(--border);transition:all .3s}
        .tag:hover{background:#222240;border-color:var(--gold)}
        .tag-pattern{font-family:'Orbitron',sans-serif;color:var(--gold);letter-spacing:2px;background:rgba(240,192,64,.08)}
        .stats-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:15px}
        @media(max-width:700px){.stats-row{grid-template-columns:repeat(3,1fr)}}
        .stat-box{background:#1a1a2e;border-radius:14px;padding:16px;text-align:center;border:1px solid var(--border);transition:all .3s}
        .stat-box:hover{transform:translateY(-2px);border-color:var(--gold)}
        .stat-num{font-family:'Orbitron',sans-serif;font-size:1.8em;font-weight:900;color:var(--gold)}
        .stat-lbl{font-size:.72em;opacity:.6;margin-top:5px;text-transform:uppercase;letter-spacing:1px}
        .table-wrap{overflow-x:auto;border-radius:12px}
        table{width:100%;border-collapse:collapse;font-size:.87em}
        thead th{background:#1a1a2e;padding:14px 10px;text-align:center;font-family:'Orbitron',sans-serif;font-size:.7em;letter-spacing:2px;color:var(--gold);text-transform:uppercase;border-bottom:2px solid var(--border);position:sticky;top:0}
        tbody td{padding:11px 8px;text-align:center;border-bottom:1px solid var(--border);transition:all .2s}
        tbody tr:hover{background:rgba(255,255,255,.03)}
        tbody tr:nth-child(even){background:rgba(255,255,255,.01)}
        .badge{display:inline-block;padding:5px 14px;border-radius:20px;font-weight:700;font-size:.8em;letter-spacing:1px}
        .badge-tai{background:rgba(255,59,92,.15);color:var(--tai);border:1px solid rgba(255,59,92,.3)}
        .badge-xiu{background:rgba(0,230,118,.15);color:var(--xiu);border:1px solid rgba(0,230,118,.3)}
        .badge-dung{background:rgba(0,230,118,.18);color:#00e676;border:1px solid rgba(0,230,118,.4);animation:correctPulse 2s infinite}
        @keyframes correctPulse{0%,100%{box-shadow:0 0 0 rgba(0,230,118,0)}50%{box-shadow:0 0 20px rgba(0,230,118,.3)}}
        .badge-sai{background:rgba(255,59,92,.18);color:#ff3b5c;border:1px solid rgba(255,59,92,.4)}
        .badge-cho{background:rgba(240,192,64,.15);color:var(--gold);border:1px solid rgba(240,192,64,.3);animation:pulse 1.5s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
        .footer{text-align:center;padding:28px 0 20px;opacity:.5;font-size:.8em;border-top:2px solid var(--border);margin-top:25px;position:relative}
        .footer::before{content:'';position:absolute;top:-2px;left:50%;transform:translateX(-50%);width:150px;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
        .footer strong{color:var(--gold);letter-spacing:1px}
        .reasons-list{max-height:150px;overflow-y:auto;margin:10px 0;font-size:.8em;opacity:.8;text-align:left;padding:0 10px}
        .reasons-list li{margin:4px 0;padding:3px 0}
        .scrollbar::-webkit-scrollbar{width:4px}.scrollbar::-webkit-scrollbar-thumb{background:var(--gold);border-radius:4px}
        @media(max-width:600px){.header .logo{font-size:2em}.pred-val{font-size:5em}.prob-num{font-size:1.8em}.stat-num{font-size:1.3em}}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">TAI XIU AI</div>
            <div class="sub">He Thong Du Doan Thong Minh</div>
            <span class="brand">VanHoa CSKHToolHehe PREMIUM</span>
            <span class="live-badge"><span class="live-dot"></span> LIVE 2s</span>
        </div>
        <div class="grid">
            <div class="card" id="predCard">
                <div class="card-title">DU DOAN TIEP THEO</div>
                <div class="pred-box" id="predContent"><p style="opacity:.5;padding:50px;">Dang tai du lieu...</p></div>
            </div>
            <div class="card" id="statsCard">
                <div class="card-title">THONG KE & PHAN TICH</div>
                <div class="stats-row" id="statsContent"></div>
                <div id="patternInfo"></div>
                <div class="reasons-list scrollbar" id="reasonsList" style="max-height:180px;"></div>
            </div>
        </div>
        <div class="card">
            <div class="card-title">LICH SU DU DOAN (20 Phien Gan Nhat)</div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>#</th><th>Phien</th><th>Du Doan</th><th>Tin Cay</th><th>Suc Manh</th><th>Ket Qua</th><th>Xuc Xac</th><th>Diem</th><th>Danh Gia</th><th>Thoi Gian</th></tr></thead>
                    <tbody id="historyBody"><tr><td colspan="10" style="padding:35px;">Dang tai...</td></tr></tbody>
                </table>
            </div>
        </div>
        <div class="footer">&copy; 2026 <strong>VanHoa CSKHToolHehe</strong> - All Rights Reserved<br>AI Tai Xiu Predictor Premium Edition v4.0</div>
    </div>
    <script>
        async function fetchData(){try{const r=await fetch('/api/latest');const d=await r.json();if(d.status!=='success')return;updatePrediction(d);updateStats(d);updateHistory(d)}catch(e){}}
        function updatePrediction(d){
            const h=d.lichSu||[],lp=h[0];
            if(!lp){document.getElementById('predContent').innerHTML='<p style="opacity:.5;padding:50px;">Chua co du doan</p>';return}
            const cls=lp.duDoan==='TAI'?'pred-tai':'pred-xiu';
            const strengthMap={RAT_MANH:'strength-strong',MANH:'strength-strong',KHA:'strength-medium',TRUNG_BINH:'strength-medium',YEU:'strength-weak'};
            const strengthCls=strengthMap[lp.sucManh]||'strength-medium';
            document.getElementById('predContent').innerHTML=\`
                <div class="pred-val \${cls}">\${lp.duDoan}</div>
                <div class="session-tag">Phien <strong>#\${lp.phienDuDoan}</strong></div>
                <span class="strength-badge \${strengthCls}">\${lp.sucManh||'TRUNG BINH'}</span>
                <div class="conf-bar"><div class="conf-fill" style="width:\${lp.doTinCay}%">\${lp.doTinCay}% TIN CAY</div></div>
                <div class="prob-grid">
                    <div class="prob-card"><div class="prob-lbl">TAI</div><div class="prob-num prob-tai">\${lp.xacSuatTai||50}%</div></div>
                    <div class="prob-card"><div class="prob-lbl">XIU</div><div class="prob-num prob-xiu">\${lp.xacSuatXiu||50}%</div></div>
                </div>
                <div class="tags-row">
                    <span class="tag">Streak: \${lp.phanTich?.currentStreak||0} \${lp.phanTich?.currentType||''}</span>
                    <span class="tag">Mau: \${lp.phanTich?.totalSamples||0} phien</span>
                    <span class="tag">Diem TB: \${lp.phanTich?.avgPoint||0}</span>
                </div>
                \${lp.trangThai==='Da hoan thanh'?\`
                    <div style="margin-top:10px;font-size:.9em;">
                        Ket qua: <span class="badge \${lp.ketQuaThucTe==='TAI'?'badge-tai':'badge-xiu'}">\${lp.ketQuaThucTe}</span>
                        | Xuc xac: \${(lp.dicesThucTe||[]).join(' - ')}
                        | Diem: \${lp.diemThucTe||0}
                        | <span class="badge \${lp.danhGia==='Dung'?'badge-dung':'badge-sai'}">\${lp.danhGia}</span>
                    </div>
                \`:''}
            \`;
        }
        function updateStats(d){
            const s=d.thongKe||{},h=d.lichSu||[],lp=h[0],p=lp?.phanTich?.patterns||{};
            document.getElementById('statsContent').innerHTML=\`
                <div class="stat-box"><div class="stat-num">\${s.tong||0}</div><div class="stat-lbl">Tong</div></div>
                <div class="stat-box"><div class="stat-num" style="color:#00e676;">\${s.dung||0}</div><div class="stat-lbl">Dung</div></div>
                <div class="stat-box"><div class="stat-num" style="color:#ff3b5c;">\${s.sai||0}</div><div class="stat-lbl">Sai</div></div>
                <div class="stat-box"><div class="stat-num" style="color:var(--gold);">\${s.doChinhXac||0}%</div><div class="stat-lbl">Do CX</div></div>
                <div class="stat-box"><div class="stat-num" style="color:#448aff;">\${s.streakDung||0}</div><div class="stat-lbl">Streak Dung</div></div>
            \`;
            document.getElementById('patternInfo').innerHTML=\`
                <div class="tags-row" style="justify-content:flex-start;">
                    <span class="tag tag-pattern">P3: \${p.last3||'-'}</span>
                    <span class="tag tag-pattern">P5: \${p.last5||'-'}</span>
                    <span class="tag tag-pattern">P7: \${p.last7||'-'}</span>
                    <span class="tag tag-pattern">P10: \${p.last10||'-'}</span>
                </div>
            \`;
            const reasons=lp?.phanTich?.reasons||[];
            document.getElementById('reasonsList').innerHTML=reasons.length?\`<strong style="color:var(--gold);">Ly do du doan:</strong><ul>\${reasons.map(r=>'<li>'+r+'</li>').join('')}</ul>\`:'';
        }
        function updateHistory(d){
            const h=d.lichSu||[],tb=document.getElementById('historyBody');
            if(!h.length){tb.innerHTML='<tr><td colspan="10" style="padding:35px;">Chua co du doan</td></tr>';return}
            tb.innerHTML=h.slice(0,20).map((p,i)=>{
                const t=p.thoiGianDuDoan?new Date(p.thoiGianDuDoan).toLocaleTimeString('vi-VN'):'-';
                const status=p.trangThai==='Dang cho'?'<span class="badge badge-cho">Dang cho</span>':(p.danhGia==='Dung'?'<span class="badge badge-dung">DUNG</span>':'<span class="badge badge-sai">SAI</span>');
                const result=p.ketQuaThucTe?\`<span class="badge \${p.ketQuaThucTe==='TAI'?'badge-tai':'badge-xiu'}">\${p.ketQuaThucTe}</span>\`:'<span style="opacity:.35;">---</span>';
                const dices=p.dicesThucTe?p.dicesThucTe.join('-'):'---';
                const point=p.diemThucTe||'---';
                const strengthMap={RAT_MANH:'💎',MANH:'🔥',KHA:'👍',TRUNG_BINH:'➖',YEU:'⚠️'};
                return\`<tr>
                    <td>\${i+1}</td><td><strong>#\${p.phienDuDoan}</strong></td>
                    <td><span class="badge \${p.duDoan==='TAI'?'badge-tai':'badge-xiu'}">\${p.duDoan}</span></td>
                    <td>\${p.doTinCay}%</td><td>\${strengthMap[p.sucManh]||'➖'} \${p.sucManh||'-'}</td>
                    <td>\${result}</td><td>\${dices}</td><td>\${point}</td>
                    <td>\${status}</td><td style="font-size:.78em;">\${t}</td>
                </tr>\`;
            }).join('');
        }
        fetchData();setInterval(fetchData,2000);
    </script>
</body>
</html>`);
});

// ==================== 404 ====================
app.use((req, res) => {
    res.status(404).json({ status: 'error', message: 'Dung /vanhoa hoac /' });
});

// ==================== START ====================
app.listen(PORT, () => {
    console.log('╔══════════════════════════════════════╗');
    console.log('║  VanHoa Tai Xiu AI Predictor VIP   ║');
    console.log('║  Port: ' + PORT + '                        ║');
    console.log('║  /vanhoa - API JSON                ║');
    console.log('║  /       - Giao dien VIP           ║');
    console.log('╚══════════════════════════════════════╝');
});
