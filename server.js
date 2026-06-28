const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const API_GOC = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
let predictionHistory = [];
const MAX_HISTORY = 20;

async function fetchSessions() {
    try {
        const res = await axios.get(API_GOC, { timeout: 10000 });
        if (res.data && res.data.list) return res.data.list.sort((a, b) => b.id - a.id);
    } catch (e) { console.error('Lỗi fetch:', e.message); }
    return [];
}

function getPatterns(results) {
    const arr = results.map(r => r === 'TAI' ? 'T' : 'X');
    return {
        full: arr.join(''),
        last3: arr.slice(0, 3).join(''),
        last5: arr.slice(0, 5).join(''),
        last7: arr.slice(0, 7).join(''),
        last10: arr.slice(0, 10).join('')
    };
}

function predictAI(sessions) {
    if (!sessions || sessions.length < 5) {
        return {
            prediction: 'TAI', confidence: 50, taiProbability: 50, xiuProbability: 50,
            analysis: { totalSamples: 0, taiCount: 0, xiuCount: 0, currentStreak: 0, currentType: null, avgPoint: 0, patterns: {}, reasons: [] }
        };
    }

    const results = sessions.map(s => s.resultTruyenThong);
    const points = sessions.map(s => s.point);
    const dices = sessions.flatMap(s => s.dices);
    const patterns = getPatterns(results);

    let scores = { TAI: 0, XIU: 0 };
    let reasons = [];

    const taiCount = results.filter(r => r === 'TAI').length;
    const xiuCount = results.filter(r => r === 'XIU').length;
    const total = results.length;
    const taiRatio = taiCount / total;

    if (taiRatio > 0.65) { scores.XIU += 30; reasons.push('Tài nhiều >65% -> bắt đảo Xỉu'); }
    else if (taiRatio < 0.35) { scores.TAI += 30; reasons.push('Xỉu nhiều >65% -> bắt đảo Tài'); }
    else if (taiRatio > 0.58) { scores.XIU += 20; reasons.push('Tài 58-65% -> nghiêng Xỉu'); }
    else if (taiRatio < 0.42) { scores.TAI += 20; reasons.push('Xỉu 58-65% -> nghiêng Tài'); }
    else if (taiRatio > 0.52) { scores.XIU += 10; }
    else if (taiRatio < 0.48) { scores.TAI += 10; }
    else { scores.TAI += 8; scores.XIU += 8; reasons.push('Cân bằng Tài/Xỉu'); }

    let streak = 1;
    const currentType = results[0];
    for (let i = 1; i < results.length; i++) {
        if (results[i] === currentType) streak++;
        else break;
    }

    if (streak >= 5) {
        scores[currentType === 'TAI' ? 'XIU' : 'TAI'] += 35;
        reasons.push(`Streak ${streak} ${currentType} -> đảo chiều mạnh`);
    } else if (streak >= 3) {
        scores[currentType === 'TAI' ? 'XIU' : 'TAI'] += 25;
        reasons.push(`Streak ${streak} ${currentType} -> đảo chiều`);
    } else if (streak === 2) {
        scores[currentType] += 15;
        reasons.push(`Streak 2 ${currentType} -> tiếp tục`);
    }

    const p3 = patterns.last3;
    if (p3 === 'TTT') { scores.XIU += 25; reasons.push('3 Tài liên tiếp -> bắt Xỉu'); }
    else if (p3 === 'XXX') { scores.TAI += 25; reasons.push('3 Xỉu liên tiếp -> bắt Tài'); }
    else if (p3 === 'TTX') { scores.XIU += 18; reasons.push('TTX -> Xỉu'); }
    else if (p3 === 'XXT') { scores.TAI += 18; reasons.push('XXT -> Tài'); }
    else if (p3 === 'TXX') { scores.TAI += 14; reasons.push('TXX -> Tài'); }
    else if (p3 === 'XTT') { scores.XIU += 14; reasons.push('XTT -> Xỉu'); }
    else if (p3 === 'TXT') { scores.TAI += 12; reasons.push('TXT -> Tài'); }
    else if (p3 === 'XTX') { scores.XIU += 12; reasons.push('XTX -> Xỉu'); }

    const p5 = patterns.last5;
    if (p5 === 'TTTTT') { scores.XIU += 25; reasons.push('5T -> đảo Xỉu'); }
    else if (p5 === 'XXXXX') { scores.TAI += 25; reasons.push('5X -> đảo Tài'); }
    else if (p5 === 'TTTTX') { scores.XIU += 18; reasons.push('4T1X -> Xỉu'); }
    else if (p5 === 'XXXXT') { scores.TAI += 18; reasons.push('4X1T -> Tài'); }
    else if ((p5.match(/T/g) || []).length >= 4) { scores.XIU += 12; reasons.push('4+ Tài trong 5 -> Xỉu'); }
    else if ((p5.match(/X/g) || []).length >= 4) { scores.TAI += 12; reasons.push('4+ Xỉu trong 5 -> Tài'); }

    const p7 = patterns.last7;
    const t7 = (p7.match(/T/g) || []).length;
    const x7 = (p7.match(/X/g) || []).length;
    if (t7 >= 6) { scores.XIU += 20; reasons.push('6+ Tài/7 -> đảo Xỉu'); }
    else if (x7 >= 6) { scores.TAI += 20; reasons.push('6+ Xỉu/7 -> đảo Tài'); }
    else if (t7 >= 5) { scores.XIU += 10; reasons.push('5 Tài/7 -> nghiêng Xỉu'); }
    else if (x7 >= 5) { scores.TAI += 10; reasons.push('5 Xỉu/7 -> nghiêng Tài'); }

    const avgPoint = points.reduce((a, b) => a + b, 0) / points.length;
    const recent5Avg = points.slice(0, 5).reduce((a, b) => a + b, 0) / 5;

    if (recent5Avg > 12.5) { scores.XIU += 15; reasons.push(`5 phiên gần điểm cao ${recent5Avg.toFixed(1)} -> Xỉu`); }
    else if (recent5Avg < 8.5) { scores.TAI += 15; reasons.push(`5 phiên gần điểm thấp ${recent5Avg.toFixed(1)} -> Tài`); }
    else if (avgPoint > 11.8) { scores.XIU += 10; }
    else if (avgPoint < 9.2) { scores.TAI += 10; }

    const diceFreq = {};
    dices.forEach(d => diceFreq[d] = (diceFreq[d] || 0) + 1);
    const recentDices = sessions.slice(0, 10).flatMap(s => s.dices);
    const recentDiceFreq = {};
    recentDices.forEach(d => recentDiceFreq[d] = (recentDiceFreq[d] || 0) + 1);

    const highRecent = (recentDiceFreq[4] || 0) + (recentDiceFreq[5] || 0) + (recentDiceFreq[6] || 0);
    const lowRecent = (recentDiceFreq[1] || 0) + (recentDiceFreq[2] || 0) + (recentDiceFreq[3] || 0);

    if (highRecent > lowRecent * 1.5) { scores.TAI += 15; reasons.push('Xúc xắc gần đây cao -> Tài'); }
    else if (lowRecent > highRecent * 1.5) { scores.XIU += 15; reasons.push('Xúc xắc gần đây thấp -> Xỉu'); }

    let changes = 0;
    for (let i = 1; i < Math.min(results.length, 20); i++) {
        if (results[i] !== results[i-1]) changes++;
    }
    const changeRate = changes / Math.min(results.length - 1, 19);
    if (changeRate > 0.7) {
        if (currentType === 'TAI') scores.XIU += 10;
        else scores.TAI += 10;
        reasons.push('Thay đổi liên tục -> đảo chiều');
    }

    const totalScore = scores.TAI + scores.XIU;
    const prediction = scores.TAI >= scores.XIU ? 'TAI' : 'XIU';
    const confidence = Math.min(Math.round((Math.max(scores.TAI, scores.XIU) / totalScore) * 10000) / 100, 99.99);
    const taiProb = Math.round((scores.TAI / totalScore) * 10000) / 100;
    const xiuProb = Math.round((scores.XIU / totalScore) * 10000) / 100;

    let strength = '';
    if (confidence >= 85) strength = 'RẤT MẠNH';
    else if (confidence >= 75) strength = 'MẠNH';
    else if (confidence >= 65) strength = 'KHÁ';
    else if (confidence >= 55) strength = 'TRUNG BÌNH';
    else strength = 'YẾU';

    return {
        prediction, confidence, taiProbability: taiProb, xiuProbability: xiuProb, strength, scores,
        analysis: {
            totalSamples: results.length, taiCount, xiuCount, taiRatio: Math.round(taiRatio * 100) / 100,
            currentStreak: streak, currentType, avgPoint: Math.round(avgPoint * 100) / 100,
            recent5Avg: Math.round(recent5Avg * 100) / 100, changeRate: Math.round(changeRate * 100) / 100,
            patterns, reasons
        }
    };
}

// FIX: Cập nhật kết quả - SO SÁNH CHUẨN
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
                p.tongDiemThucTe = found.dices.reduce((a, b) => a + b, 0);
                p.trangThai = 'Đã hoàn thành';
                // FIX QUAN TRỌNG: So sánh TRỰC TIẾP string
                if (String(p.duDoan).trim() === String(p.ketQuaThucTe).trim()) {
                    p.danhGia = 'Đúng';
                } else {
                    p.danhGia = 'Sai';
                }
                p.thoiGianHoanThanh = new Date().toISOString();
                console.log(`Đánh giá phiên #${p.phienDuDoan}: Dự đoán=${p.duDoan}, KQ=${p.ketQuaThucTe} -> ${p.danhGia}`);
            }
        }
    });
}

app.get('/vanhoa', async (req, res) => {
    try {
        const sessions = await fetchSessions();
        if (!sessions.length) return res.json({ status: 'error', message: 'Không lấy được dữ liệu' });

        await updateResults();
        const prediction = predictAI(sessions);
        const latest = sessions[0];
        const prevSession = sessions[1] || null;
        const nextId = latest.id + 1;

        const newPred = {
            id: predictionHistory.length + 1, phienDuDoan: nextId,
            duDoan: prediction.prediction, doTinCay: prediction.confidence,
            sucManh: prediction.strength, xacSuatTai: prediction.taiProbability,
            xacSuatXiu: prediction.xiuProbability, diemSo: prediction.scores,
            thoiGianDuDoan: new Date().toISOString(), trangThai: 'Đang chờ',
            ketQuaThucTe: null, dicesThucTe: null, diemThucTe: null,
            tongDiemThucTe: null, danhGia: null, thoiGianHoanThanh: null
        };

        predictionHistory.push(newPred);
        if (predictionHistory.length > MAX_HISTORY) predictionHistory = predictionHistory.slice(-MAX_HISTORY);

        const completed = predictionHistory.filter(p => p.trangThai === 'Đã hoàn thành');
        const correct = completed.filter(p => p.danhGia === 'Đúng').length;
        const incorrect = completed.filter(p => p.danhGia === 'Sai').length;
        let correctStreak = 0;
        for (let i = predictionHistory.length - 1; i >= 0; i--) {
            if (predictionHistory[i].danhGia === 'Đúng') correctStreak++;
            else break;
        }

        res.json({
            status: 'success', thoiGian: new Date().toISOString(),
            banQuyen: 'VanHoa CSKHToolHehe Premium v7',
            phienTruoc: prevSession ? { id: prevSession.id, ketQua: prevSession.resultTruyenThong, dices: prevSession.dices, diem: prevSession.point, tongDiem: prevSession.dices.reduce((a,b)=>a+b,0) } : null,
            phienHienTai: { id: latest.id, ketQua: latest.resultTruyenThong, dices: latest.dices, diem: latest.point, tongDiem: latest.dices.reduce((a,b)=>a+b,0) },
            duDoan: { phienDuDoan: nextId, duDoan: prediction.prediction, doTinCay: prediction.confidence, sucManh: prediction.strength, xacSuatTai: prediction.taiProbability, xacSuatXiu: prediction.xiuProbability, phanTich: prediction.analysis },
            lichSu: { tongDuDoan: predictionHistory.length, daHoanThanh: completed.length, dangCho: predictionHistory.length - completed.length, soLanDung: correct, soLanSai: incorrect, doChinhXac: completed.length > 0 ? Math.round((correct / completed.length) * 10000) / 100 : 0, streakDungLienTiep: correctStreak, danhSach: predictionHistory.slice().reverse() }
        });
    } catch (e) { res.json({ status: 'error', message: e.message }); }
});

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
    const latest = sessions[0] || null;
    const prev = sessions[1] || null;
    res.json({
        status: 'success', banQuyen: 'VanHoa CSKHToolHehe',
        phienTruoc: prev ? { id: prev.id, ketQua: prev.resultTruyenThong, dices: prev.dices, diem: prev.point, tongDiem: prev.dices.reduce((a,b)=>a+b,0) } : null,
        phienHienTai: latest ? { id: latest.id, ketQua: latest.resultTruyenThong, dices: latest.dices, diem: latest.point, tongDiem: latest.dices.reduce((a,b)=>a+b,0) } : null,
        lichSu: predictionHistory.slice().reverse(),
        thongKe: { tong: predictionHistory.length, dung: correct, sai: completed.length - correct, doChinhXac: completed.length > 0 ? Math.round((correct / completed.length) * 100) : 0, streakDung: correctStreak }
    });
});

app.get('/api/history', async (req, res) => {
    await updateResults();
    const completed = predictionHistory.filter(p => p.trangThai === 'Đã hoàn thành');
    const correct = completed.filter(p => p.danhGia === 'Đúng').length;
    res.json({ status: 'success', lichSu: predictionHistory.slice().reverse(), thongKe: { tong: predictionHistory.length, dung: correct, sai: completed.length - correct, doChinhXac: completed.length > 0 ? Math.round((correct / completed.length) * 100) : 0 } });
});

app.get('/api/raw', async (req, res) => {
    const sessions = await fetchSessions();
    res.json({ status: 'success', nguon: API_GOC, tongPhien: sessions.length, data: sessions.slice(0, 50) });
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VanHoa Tai Xiu AI VIP v7</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Be+Vietnam+Pro:wght@300;400;600;700;900&display=swap" rel="stylesheet">
    <style>
        :root{--bg:#020208;--card:#08081a;--gold:#f0c040;--tai:#ff3b5c;--xiu:#00e676;--blue:#448aff;--purple:#b388ff;--pink:#ff6b9d;--text:#e8e8e8;--border:#1a1a38}
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Be Vietnam Pro',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
        body::before{content:'';position:fixed;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at 50% 0%,rgba(240,192,64,.04) 0%,transparent 55%),radial-gradient(ellipse at 80% 80%,rgba(68,138,255,.03) 0%,transparent 55%);pointer-events:none;z-index:0}
        .container{max-width:1450px;margin:0 auto;padding:15px;position:relative;z-index:1}
        .header{text-align:center;padding:28px 0 18px;border-bottom:2px solid var(--border);margin-bottom:20px;position:relative}
        .header::after{content:'';position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);width:300px;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
        .logo{font-family:'Orbitron',sans-serif;font-size:3em;font-weight:900;background:linear-gradient(135deg,var(--gold),var(--pink),var(--purple),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:logoGlow 3s ease-in-out infinite;margin-bottom:5px}
        @keyframes logoGlow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.5)}}
        .sub{font-size:.95em;opacity:.7;letter-spacing:3px;text-transform:uppercase}
        .brand{display:inline-block;background:linear-gradient(135deg,var(--gold),#ff8c00);color:#000;padding:8px 25px;border-radius:30px;font-weight:800;font-size:.88em;margin-top:8px;letter-spacing:2px;box-shadow:0 0 30px rgba(240,192,64,.3)}
        .live-badge{display:inline-flex;align-items:center;gap:8px;background:#1a1a2e;padding:8px 20px;border-radius:25px;font-size:.82em;margin-left:12px;border:1px solid var(--border)}
        .live-dot{width:10px;height:10px;background:#00e676;border-radius:50%;animation:blink 1s infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        .top-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:18px}
        @media(max-width:1050px){.top-row{grid-template-columns:1fr 1fr}}
        @media(max-width:700px){.top-row{grid-template-columns:1fr}}
        .card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:22px;transition:all .35s;position:relative;overflow:hidden}
        .card:hover{border-color:var(--gold);box-shadow:0 0 40px rgba(240,192,64,.08);transform:translateY(-2px)}
        .card-title{display:flex;align-items:center;gap:10px;margin-bottom:16px;font-family:'Orbitron',sans-serif;font-size:1em;color:var(--gold);letter-spacing:2px;text-transform:uppercase}
        .pred-box{text-align:center;padding:15px 0}
        .pred-val{font-family:'Orbitron',sans-serif;font-size:7.5em;font-weight:900;line-height:1;animation:bounceIn .6s ease}
        @keyframes bounceIn{0%{transform:scale(.3);opacity:0}50%{transform:scale(1.1)}70%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}
        .pred-tai{color:var(--tai);text-shadow:0 0 60px rgba(255,59,92,.7)}
        .pred-xiu{color:var(--xiu);text-shadow:0 0 60px rgba(0,230,118,.7)}
        .session-tag{font-size:1.15em;margin:6px 0;opacity:.85}
        .strength-badge{display:inline-block;padding:6px 18px;border-radius:20px;font-weight:700;font-size:.82em;letter-spacing:1px;margin:5px 0}
        .s-strong{background:rgba(0,230,118,.2);color:#00e676;border:1px solid rgba(0,230,118,.4)}
        .s-medium{background:rgba(240,192,64,.2);color:var(--gold);border:1px solid rgba(240,192,64,.4)}
        .s-weak{background:rgba(255,59,92,.2);color:var(--tai);border:1px solid rgba(255,59,92,.4)}
        .conf-bar{background:#1a1a2e;border-radius:14px;height:36px;margin:15px 0;overflow:hidden;border:1px solid var(--border)}
        .conf-fill{height:100%;border-radius:14px;background:linear-gradient(90deg,var(--blue),var(--purple),var(--pink));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.88em;transition:width 1s ease}
        .prob-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
        .prob-card{background:#1a1a2e;border-radius:14px;padding:15px;text-align:center;border:1px solid var(--border)}
        .prob-lbl{font-size:.82em;opacity:.7;text-transform:uppercase;letter-spacing:2px}
        .prob-num{font-family:'Orbitron',sans-serif;font-size:2.2em;font-weight:900}
        .prob-tai{color:var(--tai)}.prob-xiu{color:var(--xiu)}
        .info-row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;justify-content:center}
        .tag{background:#1a1a2e;padding:5px 14px;border-radius:18px;font-size:.76em;border:1px solid var(--border)}
        .tag-pattern{font-family:'Orbitron',sans-serif;color:var(--gold);letter-spacing:2px;background:rgba(240,192,64,.06)}
        .session-info-card{text-align:center}
        .sess-id{font-family:'Orbitron',sans-serif;font-size:2em;color:var(--gold);margin-bottom:8px}
        .dice-row{display:flex;justify-content:center;gap:14px;margin:14px 0}
        .dice-box{width:60px;height:60px;background:linear-gradient(135deg,#1a1a2e,#252545);border:2px solid var(--border);border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Orbitron',sans-serif;font-size:2em;font-weight:900;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,.3)}
        .result-big{font-family:'Orbitron',sans-serif;font-size:2em;font-weight:900;margin:6px 0}
        .result-tai{color:var(--tai)}.result-xiu{color:var(--xiu)}
        .stats-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
        @media(max-width:750px){.stats-grid{grid-template-columns:repeat(3,1fr)}}
        .stat-box{background:#1a1a2e;border-radius:14px;padding:16px;text-align:center;border:1px solid var(--border)}
        .stat-num{font-family:'Orbitron',sans-serif;font-size:1.7em;font-weight:900;color:var(--gold)}
        .stat-lbl{font-size:.7em;opacity:.6;margin-top:5px;text-transform:uppercase;letter-spacing:1px}
        .table-wrap{overflow-x:auto;border-radius:14px}
        table{width:100%;border-collapse:collapse;font-size:.86em}
        thead th{background:#1a1a2e;padding:14px 10px;text-align:center;font-family:'Orbitron',sans-serif;font-size:.7em;letter-spacing:2px;color:var(--gold);text-transform:uppercase;border-bottom:2px solid var(--border);white-space:nowrap}
        tbody td{padding:11px 8px;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap}
        tbody tr:hover{background:rgba(255,255,255,.025)}
        .badge{display:inline-block;padding:5px 14px;border-radius:20px;font-weight:700;font-size:.78em;letter-spacing:1px}
        .badge-tai{background:rgba(255,59,92,.18);color:var(--tai);border:1px solid rgba(255,59,92,.3)}
        .badge-xiu{background:rgba(0,230,118,.18);color:var(--xiu);border:1px solid rgba(0,230,118,.3)}
        .badge-dung{background:rgba(0,230,118,.2);color:#00e676;border:1px solid rgba(0,230,118,.4);animation:correctGlow 2s infinite}
        @keyframes correctGlow{0%,100%{box-shadow:0 0 0 rgba(0,230,118,0)}50%{box-shadow:0 0 18px rgba(0,230,118,.35)}}
        .badge-sai{background:rgba(255,59,92,.2);color:#ff3b5c;border:1px solid rgba(255,59,92,.4)}
        .badge-cho{background:rgba(240,192,64,.18);color:var(--gold);border:1px solid rgba(240,192,64,.3);animation:pulse 1.5s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .footer{text-align:center;padding:25px 0 20px;opacity:.45;font-size:.78em;border-top:2px solid var(--border);margin-top:22px}
        .footer strong{color:var(--gold)}
        @media(max-width:650px){.logo{font-size:2em}.pred-val{font-size:4.5em}.dice-box{width:45px;height:45px;font-size:1.5em}}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">TAI XIU AI</div>
            <div class="sub">He Thong Du Doan An Thong</div>
            <span class="brand">VanHoa CSKHToolHehe PREMIUM v7</span>
            <span class="live-badge"><span class="live-dot"></span> LIVE 2s</span>
        </div>
        <div class="top-row">
            <div class="card"><div class="card-title">🎯 DU DOAN TIEP THEO</div><div class="pred-box" id="predContent"><p style="opacity:.5;padding:40px;">Dang tai...</p></div></div>
            <div class="card session-info-card"><div class="card-title">📡 PHIEN HIEN TAI</div><div id="currentContent"><p style="opacity:.5;padding:35px;">Dang tai...</p></div></div>
            <div class="card session-info-card"><div class="card-title">⏮️ PHIEN TRUOC</div><div id="prevContent"><p style="opacity:.5;padding:35px;">Dang tai...</p></div></div>
        </div>
        <div class="card" style="margin-bottom:18px;">
            <div class="card-title">📊 THONG KE & PHAN TICH</div>
            <div class="stats-grid" id="statsContent"></div>
            <div id="patternInfo" style="margin-top:12px;"></div>
            <div id="reasonsList" style="margin-top:8px;font-size:.8em;opacity:.75;"></div>
        </div>
        <div class="card">
            <div class="card-title">📝 LICH SU DU DOAN (20 Phien)</div>
            <div class="table-wrap"><table><thead><tr><th>#</th><th>Phien</th><th>Du Doan</th><th>Tin Cay</th><th>Suc Manh</th><th>KQ Thuc Te</th><th>Xuc Xac</th><th>Tong Diem</th><th>Danh Gia</th><th>Thoi Gian</th></tr></thead><tbody id="historyBody"><tr><td colspan="10" style="padding:35px;">Dang tai...</td></tr></tbody></table></div>
        </div>
        <div class="footer">&copy; 2026 <strong>VanHoa CSKHToolHehe</strong> - AI An Thong Predictor v7.0</div>
    </div>
    <script>
        async function fetchData(){try{const r=await fetch('/api/latest');const d=await r.json();if(d.status!=='success')return;updatePrediction(d);updateSessions(d);updateStats(d);updateHistory(d)}catch(e){}}
        function updatePrediction(d){const h=d.lichSu||[],lp=h[0];if(!lp)return;const cls=lp.duDoan==='TAI'?'pred-tai':'pred-xiu';const sm={RAT_MANH:'s-strong',MANH:'s-strong',KHA:'s-medium',TRUNG_BINH:'s-medium',YEU:'s-weak'};document.getElementById('predContent').innerHTML=\`<div class="pred-val \${cls}">\${lp.duDoan}</div><div class="session-tag">Phien <strong>#\${lp.phienDuDoan}</strong></div><span class="strength-badge \${sm[lp.sucManh]||'s-medium'}">\${lp.sucManh||'TB'}</span><div class="conf-bar"><div class="conf-fill" style="width:\${lp.doTinCay}%">\${lp.doTinCay}% TIN CAY</div></div><div class="prob-grid"><div class="prob-card"><div class="prob-lbl">TAI</div><div class="prob-num prob-tai">\${lp.xacSuatTai||50}%</div></div><div class="prob-card"><div class="prob-lbl">XIU</div><div class="prob-num prob-xiu">\${lp.xacSuatXiu||50}%</div></div></div><div class="info-row"><span class="tag">Streak: \${lp.phanTich?.currentStreak||0} \${lp.phanTich?.currentType||''}</span><span class="tag">\${lp.phanTich?.totalSamples||0} phien</span></div>\`}
        function updateSessions(d){const c=d.phienHienTai;if(c)document.getElementById('currentContent').innerHTML=\`<div class="sess-id">#\${c.id}</div><div class="dice-row">\${c.dices.map(x=>'<div class="dice-box">'+x+'</div>').join('')}</div><div class="result-big \${c.ketQua==='TAI'?'result-tai':'result-xiu'}">\${c.ketQua}</div><div style="opacity:.75;">Diem: \${c.diem} | Tong: \${c.tongDiem}</div>\`;const p=d.phienTruoc;if(p)document.getElementById('prevContent').innerHTML=\`<div class="sess-id">#\${p.id}</div><div class="dice-row">\${p.dices.map(x=>'<div class="dice-box">'+x+'</div>').join('')}</div><div class="result-big \${p.ketQua==='TAI'?'result-tai':'result-xiu'}">\${p.ketQua}</div><div style="opacity:.75;">Diem: \${p.diem} | Tong: \${p.tongDiem}</div>\`}
        function updateStats(d){const s=d.thongKe||{},h=d.lichSu||[],lp=h[0],pt=lp?.phanTich?.patterns||{};document.getElementById('statsContent').innerHTML=\`<div class="stat-box"><div class="stat-num">\${s.tong||0}</div><div class="stat-lbl">Tong</div></div><div class="stat-box"><div class="stat-num" style="color:#00e676;">\${s.dung||0}</div><div class="stat-lbl">Dung</div></div><div class="stat-box"><div class="stat-num" style="color:#ff3b5c;">\${s.sai||0}</div><div class="stat-lbl">Sai</div></div><div class="stat-box"><div class="stat-num" style="color:var(--gold);">\${s.doChinhXac||0}%</div><div class="stat-lbl">CX</div></div><div class="stat-box"><div class="stat-num" style="color:#448aff;">\${s.streakDung||0}</div><div class="stat-lbl">Streak</div></div>\`;document.getElementById('patternInfo').innerHTML=\`<div class="info-row" style="justify-content:flex-start;"><span class="tag tag-pattern">P3: \${pt.last3||'-'}</span><span class="tag tag-pattern">P5: \${pt.last5||'-'}</span><span class="tag tag-pattern">P7: \${pt.last7||'-'}</span></div>\`;const rs=lp?.phanTich?.reasons||[];document.getElementById('reasonsList').innerHTML=rs.length?'🎯 <strong style="color:var(--gold);">Ly do:</strong> '+rs.join(' | '):''}
        function updateHistory(d){const h=d.lichSu||[],tb=document.getElementById('historyBody');if(!h.length)return;tb.innerHTML=h.slice(0,20).map((p,i)=>{const t=p.thoiGianDuDoan?new Date(p.thoiGianDuDoan).toLocaleTimeString('vi-VN'):'-';const st=p.trangThai==='Dang cho'?'<span class="badge badge-cho">⏳ Cho</span>':(p.danhGia==='Dung'?'<span class="badge badge-dung">✅ DUNG</span>':'<span class="badge badge-sai">❌ SAI</span>');const rb=p.ketQuaThucTe?\`<span class="badge \${p.ketQuaThucTe==='TAI'?'badge-tai':'badge-xiu'}">\${p.ketQuaThucTe}</span>\`:'<span style="opacity:.35;">---</span>';const dc=p.dicesThucTe?p.dicesThucTe.join('-'):'---';const sm=p.tongDiemThucTe||p.diemThucTe||'---';const ic={RAT_MANH:'💎',MANH:'🔥',KHA:'👍',TRUNG_BINH:'➖',YEU:'⚠️'};return\`<tr><td>\${i+1}</td><td><strong>#\${p.phienDuDoan}</strong></td><td><span class="badge \${p.duDoan==='TAI'?'badge-tai':'badge-xiu'}">\${p.duDoan}</span></td><td>\${p.doTinCay}%</td><td>\${ic[p.sucManh]||'➖'}</td><td>\${rb}</td><td>\${dc}</td><td>\${sm}</td><td>\${st}</td><td style="font-size:.75em;">\${t}</td></tr>\`}).join('')}
        fetchData();setInterval(fetchData,2000);
    </script>
</body>
</html>`);
});

app.use((req, res) => res.status(404).json({ status: 'error', message: 'Dung /vanhoa hoac /' }));

app.listen(PORT, () => console.log('VanHoa VIP v7 chay port ' + PORT));
