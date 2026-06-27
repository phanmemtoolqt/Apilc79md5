const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Tạo thư mục public
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
app.use(express.static(publicDir));

const API_GOC = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
let predictionHistory = [];
const MAX_HISTORY = 20;

async function fetchSessions() {
    const res = await axios.get(API_GOC, { timeout: 10000 });
    if (res.data && res.data.list) return res.data.list.sort((a, b) => b.id - a.id);
    return [];
}

function getPatterns(results) {
    const arr = results.map(r => r === 'TAI' ? 'T' : 'X');
    return {
        all: arr.join(''),
        last3: arr.slice(0, 3).join(''),
        last5: arr.slice(0, 5).join(''),
        last10: arr.slice(0, 10).join('')
    };
}

function predict(sessions) {
    const results = sessions.map(s => s.resultTruyenThong);
    const points = sessions.map(s => s.point);
    const dices = sessions.flatMap(s => s.dices);
    const patterns = getPatterns(results);

    let scores = { TAI: 0, XIU: 0 };

    const taiCount = results.filter(r => r === 'TAI').length;
    const taiRatio = taiCount / results.length;
    
    if (taiRatio > 0.65) scores.XIU += 25;
    else if (taiRatio < 0.35) scores.TAI += 25;
    else if (taiRatio > 0.55) scores.XIU += 18;
    else if (taiRatio < 0.45) scores.TAI += 18;
    else { scores.TAI += 12; scores.XIU += 12; }

    let streak = 1;
    for (let i = 1; i < results.length; i++) {
        if (results[i] === results[0]) streak++; else break;
    }
    if (streak >= 5) results[0] === 'TAI' ? (scores.XIU += 30) : (scores.TAI += 30);
    else if (streak >= 3) results[0] === 'TAI' ? (scores.XIU += 22) : (scores.TAI += 22);
    else if (streak >= 2) results[0] === 'TAI' ? (scores.TAI += 18) : (scores.XIU += 18);

    const p3 = patterns.last3;
    const p3W = { 'TTT': 'XIU', 'XXX': 'TAI', 'TTX': 'XIU', 'XXT': 'TAI', 'TXX': 'TAI', 'XTT': 'XIU', 'TXT': 'TAI', 'XTX': 'XIU' };
    if (p3W[p3]) scores[p3W[p3]] += 20;

    const p5 = patterns.last5;
    const p5W = { 'TTTTT': 'XIU', 'XXXXX': 'TAI', 'TTTTX': 'XIU', 'XXXXT': 'TAI', 'TTTXX': 'XIU', 'XXXTT': 'TAI' };
    if (p5W[p5]) scores[p5W[p5]] += 15;

    const avgPoint = points.reduce((a, b) => a + b, 0) / points.length;
    if (avgPoint > 11.5) scores.XIU += 15;
    else if (avgPoint < 9.5) scores.TAI += 15;
    else if (avgPoint > 10.8) scores.XIU += 10;
    else if (avgPoint < 10.2) scores.TAI += 10;

    const diceFreq = {};
    dices.forEach(d => diceFreq[d] = (diceFreq[d] || 0) + 1);
    const high = (diceFreq[4] || 0) + (diceFreq[5] || 0) + (diceFreq[6] || 0);
    const low = (diceFreq[1] || 0) + (diceFreq[2] || 0) + (diceFreq[3] || 0);
    if (high > low * 1.3) scores.TAI += 15;
    else if (low > high * 1.3) scores.XIU += 15;

    const total = scores.TAI + scores.XIU;
    const prediction = scores.TAI >= scores.XIU ? 'TAI' : 'XIU';
    const confidence = Math.min(Math.round((Math.max(scores.TAI, scores.XIU) / total) * 10000) / 100, 99.99);

    return {
        prediction,
        confidence,
        taiProbability: Math.round((scores.TAI / total) * 10000) / 100,
        xiuProbability: Math.round((scores.XIU / total) * 10000) / 100,
        analysis: {
            totalSamples: results.length,
            taiCount,
            xiuCount: results.length - taiCount,
            currentStreak: streak,
            currentType: results[0],
            avgPoint: Math.round(avgPoint * 100) / 100,
            patterns
        }
    };
}

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
            }
        }
    });
}

// ==================== API ====================
app.get('/vanhoa', async (req, res) => {
    try {
        const sessions = await fetchSessions();
        if (!sessions.length) return res.json({ status: 'error', message: 'Không lấy được dữ liệu' });

        await updateResults();
        const prediction = predict(sessions);
        const latest = sessions[0];
        const nextId = latest.id + 1;

        const newPred = {
            id: predictionHistory.length + 1,
            phienDuDoan: nextId,
            duDoan: prediction.prediction,
            doTinCay: prediction.confidence,
            xacSuatTai: prediction.taiProbability,
            xacSuatXiu: prediction.xiuProbability,
            thoiGianDuDoan: new Date().toISOString(),
            trangThai: 'Đang chờ',
            ketQuaThucTe: null,
            dicesThucTe: null,
            diemThucTe: null,
            danhGia: null
        };

        predictionHistory.push(newPred);
        if (predictionHistory.length > MAX_HISTORY) predictionHistory = predictionHistory.slice(-MAX_HISTORY);

        const completed = predictionHistory.filter(p => p.trangThai === 'Đã hoàn thành');
        const correct = completed.filter(p => p.danhGia === 'Đúng').length;

        res.json({
            status: 'success',
            thoiGian: new Date().toISOString(),
            duDoan: {
                phienDuDoan: nextId,
                duDoan: prediction.prediction,
                doTinCay: prediction.confidence,
                xacSuatTai: prediction.taiProbability,
                xacSuatXiu: prediction.xiuProbability,
                phanTich: prediction.analysis
            },
            lichSu: {
                tong: predictionHistory.length,
                daHoanThanh: completed.length,
                dangCho: predictionHistory.length - completed.length,
                dung: correct,
                sai: completed.length - correct,
                doChinhXac: completed.length > 0 ? Math.round((correct / completed.length) * 100) : 0,
                danhSach: predictionHistory.slice().reverse()
            },
            phienMoiNhat: { id: latest.id, ketQua: latest.resultTruyenThong, dices: latest.dices, diem: latest.point }
        });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

app.get('/api/history', async (req, res) => {
    await updateResults();
    res.json({ status: 'success', lichSu: predictionHistory.slice().reverse() });
});

app.get('/api/latest', async (req, res) => {
    const sessions = await fetchSessions();
    await updateResults();
    const completed = predictionHistory.filter(p => p.trangThai === 'Đã hoàn thành');
    const correct = completed.filter(p => p.danhGia === 'Đúng').length;
    res.json({
        status: 'success',
        phienMoiNhat: sessions[0],
        lichSu: predictionHistory.slice().reverse(),
        thongKe: {
            tong: predictionHistory.length,
            dung: correct,
            sai: completed.length - correct,
            doChinhXac: completed.length > 0 ? Math.round((correct / completed.length) * 100) : 0
        }
    });
});

// ==================== HTML ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((req, res) => res.status(404).json({ status: 'error', message: 'Dùng /vanhoa hoặc /' }));

app.listen(PORT, () => console.log(`✅ VanHoa API chạy port ${PORT}`));
