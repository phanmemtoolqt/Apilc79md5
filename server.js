const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');

// ============================================
// CONFIG
// ============================================
const CONFIG = {
    API_BASE: 'https://wtxmd52.tele68.com/v1/txmd5',
    PORT: 8080
};

// ============================================
// UTILS
// ============================================
class Utils {
    static mean(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    static std(arr) {
        if (!arr || arr.length < 2) return 0;
        const m = Utils.mean(arr);
        return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
    }

    static median(arr) {
        if (!arr || arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    static fetchJSON(url) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            protocol.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(e); }
                });
            }).on('error', reject);
        });
    }

    static count(arr, key, val) {
        return arr.filter(x => x[key] === val).length;
    }

    static freq(arr) {
        const count = {};
        arr.forEach(v => { count[v] = (count[v] || 0) + 1; });
        return count;
    }
}

// ============================================
// THUẬT TOÁN 1: PHÂN TÍCH CHUỖI CẦU (STREAK)
// ============================================
class StreakAnalyzer {
    static analyze(history) {
        const results = history.map(h => h.result);
        
        // Tìm chuỗi hiện tại
        let currentStreak = 1;
        const currentType = results[0];
        for (let i = 1; i < results.length; i++) {
            if (results[i] === currentType) currentStreak++;
            else break;
        }

        // Thống kê tất cả chuỗi
        const allStreaks = [];
        let streakCount = 1;
        for (let i = 1; i < results.length; i++) {
            if (results[i] === results[i-1]) streakCount++;
            else {
                allStreaks.push({ type: results[i-1], length: streakCount });
                streakCount = 1;
            }
        }
        allStreaks.push({ type: results[results.length-1], length: streakCount });

        // Tính xác suất gãy cầu
        const taiStreaks = allStreaks.filter(s => s.type === 'TAI');
        const xiuStreaks = allStreaks.filter(s => s.type === 'XIU');
        
        const avgTaiStreak = taiStreaks.length > 0 ? Utils.mean(taiStreaks.map(s => s.length)) : 2;
        const avgXiuStreak = xiuStreaks.length > 0 ? Utils.mean(xiuStreaks.map(s => s.length)) : 2;

        // Xác suất gãy cầu dựa trên độ dài hiện tại
        let breakProb = 0.5;
        const relevantAvg = currentType === 'TAI' ? avgTaiStreak : avgXiuStreak;
        if (currentStreak >= relevantAvg * 1.5) {
            breakProb = 0.75; // Cầu dài bất thường -> khả năng gãy cao
        } else if (currentStreak >= relevantAvg) {
            breakProb = 0.6;
        } else {
            breakProb = 0.4; // Cầu còn ngắn -> khả năng tiếp tục
        }

        return {
            currentStreak,
            currentType,
            avgTaiStreak: avgTaiStreak.toFixed(1),
            avgXiuStreak: avgXiuStreak.toFixed(1),
            breakProbability: breakProb,
            prediction: breakProb > 0.55 ? (currentType === 'TAI' ? 'XIU' : 'TAI') : currentType,
            confidence: Math.round(Math.abs(breakProb - 0.5) * 200)
        };
    }
}

// ============================================
// THUẬT TOÁN 2: PHÂN TÍCH ĐIỂM SỐ (SCORE)
// ============================================
class ScoreAnalyzer {
    static analyze(history) {
        const points = history.map(h => h.point);
        const recent5 = points.slice(0, 5);
        const recent10 = points.slice(0, 10);
        
        const mean = Utils.mean(points);
        const std = Utils.std(points);
        const recent5Mean = Utils.mean(recent5);
        const recent10Mean = Utils.mean(recent10);
        
        // Detect xu hướng điểm
        const trend5 = recent5Mean - mean;
        const trend10 = recent10Mean - mean;
        
        let prediction, confidence;
        
        // Điểm đang cao hơn trung bình -> có xu hướng giảm
        if (recent5Mean > mean + std * 0.3 && recent10Mean > mean + std * 0.2) {
            prediction = 'XIU';
            confidence = Math.round(55 + Math.abs(trend5) * 8);
        }
        // Điểm đang thấp hơn trung bình -> có xu hướng tăng
        else if (recent5Mean < mean - std * 0.3 && recent10Mean < mean - std * 0.2) {
            prediction = 'TAI';
            confidence = Math.round(55 + Math.abs(trend5) * 8);
        }
        // Dao động quanh trung bình -> theo đà gần nhất
        else {
            const last5Tai = Utils.count(history.slice(0, 5), 'result', 'TAI');
            prediction = last5Tai >= 3 ? 'TAI' : 'XIU';
            confidence = 50 + Math.abs(last5Tai - 2.5) * 10;
        }

        return {
            mean: mean.toFixed(1),
            recent5Mean: recent5Mean.toFixed(1),
            trend: trend5 > 0 ? 'UP' : 'DOWN',
            prediction,
            confidence: Math.min(85, confidence)
        };
    }
}

// ============================================
// THUẬT TOÁN 3: PHÂN TÍCH XÚC XẮC NÓNG/LẠNH
// ============================================
class DiceHotColdAnalyzer {
    static analyze(history) {
        const allDices = [];
        history.forEach(h => {
            if (h.dices) h.dices.forEach(d => allDices.push(d));
        });

        const freq = Utils.freq(allDices);
        
        // Xúc xắc nóng (xuất hiện nhiều)
        const hot = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(e => parseInt(e[0]));

        // Xúc xắc lạnh (ít xuất hiện)
        const cold = Object.entries(freq)
            .sort((a, b) => a[1] - b[1])
            .slice(0, 2)
            .map(e => parseInt(e[0]));

        // Tính xác suất TÀI dựa trên xúc xắc nóng
        const hotSum = hot.reduce((a, b) => a + b, 0);
        const hotAvg = hotSum / hot.length;
        
        // Nếu xúc xắc nóng thiên về số lớn -> TÀI
        const prediction = hotAvg > 3.5 ? 'TAI' : 'XIU';
        const confidence = Math.round(50 + Math.abs(hotAvg - 3.5) * 15);

        return {
            hot,
            cold,
            hotAvg: hotAvg.toFixed(1),
            prediction,
            confidence: Math.min(80, confidence)
        };
    }
}

// ============================================
// THUẬT TOÁN 4: PHÂN TÍCH NHỊP ĐẢO CHIỀU
// ============================================
class ReversalPatternAnalyzer {
    static analyze(history) {
        const results = history.map(h => h.result);
        const patterns = [];
        
        // Tìm các mẫu đảo chiều
        for (let i = 1; i < results.length; i++) {
            patterns.push(results[i] !== results[i-1] ? 'R' : 'C'); // R: Reverse, C: Continue
        }

        // Đếm tần suất đảo chiều gần đây
        const recentPatterns = patterns.slice(0, 10);
        const reversalCount = Utils.count(recentPatterns, null, 'R');
        const reversalRate = reversalCount / recentPatterns.length;

        // Phát hiện mẫu ABAB hoặc AABB
        let patternDetected = null;
        if (results.length >= 4) {
            const last4 = results.slice(0, 4);
            if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) {
                patternDetected = 'ABAB'; // Đảo chiều liên tục
            }
            if (last4[0] === last4[1] && last4[2] === last4[3] && last4[0] !== last4[2]) {
                patternDetected = 'AABB'; // Cặp đôi
            }
        }

        let prediction;
        if (patternDetected === 'ABAB') {
            // Nếu đang ABAB -> dự đoán đảo chiều
            prediction = results[0] === 'TAI' ? 'XIU' : 'TAI';
        } else if (patternDetected === 'AABB') {
            // Nếu đang AABB -> dự đoán tiếp tục B
            prediction = results[0];
        } else if (reversalRate > 0.6) {
            // Đảo chiều nhiều -> tiếp tục đảo chiều
            prediction = results[0] === 'TAI' ? 'XIU' : 'TAI';
        } else if (reversalRate < 0.3) {
            // Ít đảo chiều -> tiếp tục xu hướng
            prediction = results[0];
        } else {
            prediction = results[0] === 'TAI' ? 'XIU' : 'TAI';
        }

        return {
            reversalRate: (reversalRate * 100).toFixed(1) + '%',
            patternDetected,
            prediction,
            confidence: Math.round(50 + Math.abs(reversalRate - 0.5) * 40)
        };
    }
}

// ============================================
// THUẬT TOÁN 5: DỰ ĐOÁN THEO CHU KỲ PHIÊN
// ============================================
class SessionCycleAnalyzer {
    static analyze(history) {
        const results = history.map(h => h.result);
        const ids = history.map(h => h.id);
        
        // Phân tích theo vị trí phiên (chẵn/lẻ)
        let evenTai = 0, evenXiu = 0, oddTai = 0, oddXiu = 0;
        
        history.forEach(h => {
            if (h.id % 2 === 0) {
                if (h.result === 'TAI') evenTai++;
                else evenXiu++;
            } else {
                if (h.result === 'TAI') oddTai++;
                else oddXiu++;
            }
        });

        const nextId = history[0].id + 1;
        const isNextEven = nextId % 2 === 0;
        
        let prediction;
        if (isNextEven) {
            prediction = evenTai > evenXiu ? 'TAI' : 'XIU';
        } else {
            prediction = oddTai > oddXiu ? 'TAI' : 'XIU';
        }

        return {
            evenStats: { TAI: evenTai, XIU: evenXiu },
            oddStats: { TAI: oddTai, XIU: oddXiu },
            nextSessionType: isNextEven ? 'EVEN' : 'ODD',
            prediction,
            confidence: 55
        };
    }
}

// ============================================
// THUẬT TOÁN 6: PHÂN TÍCH TỔNG ĐIỂM CHUỖI
// ============================================
class SumPatternAnalyzer {
    static analyze(history) {
        if (history.length < 6) {
            return { prediction: 'TAI', confidence: 50 };
        }

        // Tính tổng điểm 3 phiên gần nhất
        const sum3 = history.slice(0, 3).reduce((s, h) => s + h.point, 0);
        const sum6 = history.slice(0, 6).reduce((s, h) => s + h.point, 0);
        
        const avg3 = sum3 / 3;
        const avg6 = sum6 / 6;
        
        // So sánh với ngưỡng
        const threshold = 10.5;
        
        let prediction;
        if (avg3 > threshold && avg6 > threshold) {
            // Cả 2 đều cao -> dự đoán giảm
            prediction = 'XIU';
        } else if (avg3 < threshold && avg6 < threshold) {
            // Cả 2 đều thấp -> dự đoán tăng
            prediction = 'TAI';
        } else if (avg3 > avg6) {
            // Ngắn hạn tăng -> tiếp tục tăng
            prediction = 'TAI';
        } else {
            prediction = 'XIU';
        }

        return {
            sum3,
            sum6,
            avg3: avg3.toFixed(1),
            avg6: avg6.toFixed(1),
            prediction,
            confidence: Math.round(50 + Math.abs(avg3 - threshold) * 10)
        };
    }
}

// ============================================
// ENSEMBLE - TỔNG HỢP 6 THUẬT TOÁN
// ============================================
class EnsemblePredictor {
    static predict(history) {
        if (!history || history.length < 5) {
            return { 
                prediction: 'TAI', 
                confidence: 50,
                error: 'Cần ít nhất 5 phiên lịch sử' 
            };
        }

        const algorithms = [
            { name: 'Phân tích cầu (Streak)', result: StreakAnalyzer.analyze(history), weight: 0.25 },
            { name: 'Phân tích điểm số', result: ScoreAnalyzer.analyze(history), weight: 0.20 },
            { name: 'Xúc xắc nóng/lạnh', result: DiceHotColdAnalyzer.analyze(history), weight: 0.15 },
            { name: 'Nhịp đảo chiều', result: ReversalPatternAnalyzer.analyze(history), weight: 0.20 },
            { name: 'Chu kỳ phiên', result: SessionCycleAnalyzer.analyze(history), weight: 0.10 },
            { name: 'Tổng điểm chuỗi', result: SumPatternAnalyzer.analyze(history), weight: 0.10 }
        ];

        // Tính điểm có trọng số
        let taiScore = 0, xiuScore = 0, totalWeight = 0;

        const details = algorithms.map(algo => {
            const w = algo.weight;
            totalWeight += w;
            const conf = algo.result.confidence / 100;
            
            if (algo.result.prediction === 'TAI') {
                taiScore += w * conf;
            } else {
                xiuScore += w * conf;
            }

            return {
                name: algo.name,
                prediction: algo.result.prediction,
                confidence: algo.result.confidence,
                details: algo.result
            };
        });

        // Chuẩn hóa
        taiScore /= totalWeight;
        xiuScore /= totalWeight;

        const prediction = taiScore > xiuScore ? 'TAI' : 'XIU';
        const confidence = Math.round(
            (Math.max(taiScore, xiuScore) / (taiScore + xiuScore)) * 100
        );

        return {
            prediction,
            confidence,
            scoreTAI: Math.round(taiScore * 100),
            scoreXIU: Math.round(xiuScore * 100),
            algorithms: details,
            voteCount: {
                TAI: details.filter(d => d.prediction === 'TAI').length,
                XIU: details.filter(d => d.prediction === 'XIU').length
            }
        };
    }
}

// ============================================
// FETCH DATA
// ============================================
async function fetchHistory() {
    try {
        const data = await Utils.fetchJSON(`${CONFIG.API_BASE}/sessions`);
        if (!data || !data.list) return null;

        return {
            list: data.list.map(s => ({
                id: s.id,
                result: s.resultTruyenThong,
                dices: s.dices,
                point: s.point
            })),
            stats: data.typeStat || { TAI: 0, XIU: 0 }
        };
    } catch (e) {
        console.error('Fetch error:', e.message);
        return null;
    }
}

// ============================================
// HTML TEMPLATE
// ============================================
function renderHTML(prediction, history, stats) {
    const predColor = prediction.prediction === 'TAI' ? '#00ff88' : '#ff4444';
    const predGlow = prediction.prediction === 'TAI' 
        ? '0 0 40px rgba(0,255,136,0.6)' 
        : '0 0 40px rgba(255,68,68,0.6)';

    const algoHTML = prediction.algorithms.map((a, i) => {
        const c = a.prediction === 'TAI' ? '#00ff88' : '#ff4444';
        return `
        <div class="algo-row">
            <span class="algo-num">${i+1}</span>
            <span class="algo-name">${a.name}</span>
            <span class="algo-pred" style="color:${c}">${a.prediction}</span>
            <span class="algo-conf">${a.confidence}%</span>
            <div class="mini-bar"><div class="mini-fill" style="width:${a.confidence}%;background:${c}"></div></div>
        </div>`;
    }).join('');

    const historyRows = history.slice(0, 30).map((h, i) => {
        const c = h.result === 'TAI' ? '#00ff88' : '#ff4444';
        const bg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)';
        return `
        <tr style="background:${bg}">
            <td>#${h.id}</td>
            <td style="color:${c};font-weight:bold">${h.result}</td>
            <td style="color:#ffd700">${h.point}</td>
            <td>[${(h.dices||[]).join(',')}]</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔮 SUPER VIP AI - TÀI XỈU PREDICTOR</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{
            font-family:'Segoe UI',monospace;
            background:linear-gradient(135deg,#0a0a0f,#1a1a2e,#0f0f1a);
            color:#fff;min-height:100vh;
        }
        .container{max-width:1000px;margin:0 auto;padding:20px}
        .header{
            text-align:center;padding:30px 0;
            border-bottom:1px solid rgba(255,255,255,0.1);
            margin-bottom:25px;
        }
        .header h1{
            font-size:2.2em;
            background:linear-gradient(45deg,#ffd700,#ff6b6b,#00ff88,#ffd700);
            background-size:300% 300%;
            -webkit-background-clip:text;
            -webkit-text-fill-color:transparent;
            animation:gradientBG 3s ease infinite;
        }
        @keyframes gradientBG{
            0%,100%{background-position:0% 50%}
            50%{background-position:100% 50%}
        }
        .header .sub{color:#888;font-size:.85em;margin-top:8px}
        
        .prediction-box{
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.1);
            border-radius:20px;padding:35px;
            text-align:center;margin-bottom:20px;
            animation:fadeIn .6s ease;
        }
        @keyframes fadeIn{
            from{opacity:0;transform:translateY(-20px)}
            to{opacity:1;transform:translateY(0)}
        }
        .pred-id{color:#ffd700;font-size:1.1em;margin-bottom:10px}
        .pred-result{
            font-size:5em;font-weight:900;
            letter-spacing:8px;margin:15px 0;
            animation:pulse 2s ease-in-out infinite;
        }
        @keyframes pulse{
            0%,100%{transform:scale(1)}
            50%{transform:scale(1.04)}
        }
        .conf-bar{
            width:100%;height:35px;
            background:rgba(255,255,255,0.08);
            border-radius:20px;overflow:hidden;margin:20px 0;
        }
        .conf-fill{
            height:100%;border-radius:20px;
            display:flex;align-items:center;justify-content:center;
            font-weight:bold;font-size:.9em;
            transition:width .8s ease;
        }
        .score-row{
            display:flex;justify-content:center;gap:40px;margin:20px 0;
        }
        .score-tai{font-size:2em;font-weight:bold;color:#00ff88}
        .score-xiu{font-size:2em;font-weight:bold;color:#ff4444}
        .score-vs{font-size:2em;color:#ffd700}
        
        .stats-row{
            display:flex;justify-content:center;gap:15px;
            flex-wrap:wrap;margin:20px 0;
        }
        .badge{
            padding:8px 20px;border-radius:25px;
            font-weight:bold;font-size:.85em;
        }
        .badge-tai{background:rgba(0,255,136,0.15);color:#00ff88;border:1px solid rgba(0,255,136,0.3)}
        .badge-xiu{background:rgba(255,68,68,0.15);color:#ff4444;border:1px solid rgba(255,68,68,0.3)}
        .badge-total{background:rgba(255,215,0,0.15);color:#ffd700;border:1px solid rgba(255,215,0,0.3)}
        
        .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
        @media(max-width:768px){.grid-2{grid-template-columns:1fr}}
        
        .card{
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.08);
            border-radius:15px;padding:20px;
        }
        .card-title{
            color:#ffd700;font-size:1.1em;
            margin-bottom:15px;padding-bottom:10px;
            border-bottom:1px solid rgba(255,215,0,0.2);
        }
        
        .algo-row{
            display:flex;align-items:center;paddi
