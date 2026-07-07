const axios = require('axios');

// ============================================
// CONFIG
// ============================================
const API_URL = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
const INTERVAL_MS = 5000; // gọi API mỗi 5 giây

// ============================================
// THUẬT TOÁN DỰ ĐOÁN VIPP - HYBRID AI ENGINE
// ============================================

function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

function softmax(arr) {
    const exps = arr.map(x => Math.exp(x - Math.max(...arr)));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(v => v / sum);
}

// Phân tích chuỗi Markov bậc 2
function markovChain(history, order = 2) {
    const transitions = {};
    for (let i = 0; i < history.length - order; i++) {
        const key = history.slice(i, i + order).join(',');
        const next = history[i + order];
        if (!transitions[key]) transitions[key] = { TAI: 0, XIU: 0 };
        transitions[key][next]++;
    }
    if (history.length >= order) {
        const lastKey = history.slice(-order).join(',');
        if (transitions[lastKey]) {
            const counts = transitions[lastKey];
            const total = counts.TAI + counts.XIU;
            return {
                TAI: counts.TAI / total,
                XIU: counts.XIU / total
            };
        }
    }
    return null;
}

// Phân tích chu kỳ dựa trên FFT đơn giản
function cycleAnalysis(history) {
    const n = history.length;
    if (n < 10) return null;
    
    const binary = history.map(h => h === 'TAI' ? 1 : -1);
    
    // Tìm chu kỳ mạnh nhất bằng autocorrelation
    let bestLag = 0;
    let bestCorr = -Infinity;
    
    for (let lag = 2; lag <= Math.min(20, Math.floor(n / 2)); lag++) {
        let corr = 0;
        let count = 0;
        for (let i = 0; i < n - lag; i++) {
            corr += binary[i] * binary[i + lag];
            count++;
        }
        corr /= count;
        if (corr > bestCorr) {
            bestCorr = corr;
            bestLag = lag;
        }
    }
    
    return { lag: bestLag, strength: bestCorr };
}

// Phân tích xu hướng cục bộ
function localTrendAnalysis(points) {
    if (points.length < 5) return null;
    
    const recent = points.slice(-20);
    const n = recent.length;
    
    // Linear regression trên điểm số
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += recent[i];
        sumXY += i * recent[i];
        sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;
    
    // Dự đoán điểm tiếp theo
    const nextPred = avgY + slope * n;
    const trend = slope > 0.3 ? 'UP' : slope < -0.3 ? 'DOWN' : 'FLAT';
    
    return {
        predictedPoint: nextPred,
        trend: trend,
        slope: slope,
        confidence: Math.min(Math.abs(slope) * 3, 0.8)
    };
}

// Phân tích phân phối xúc xắc
function diceDistributionAnalysis(sessions) {
    const diceFreq = Array(7).fill(0); // index 1-6
    let totalDice = 0;
    
    sessions.forEach(s => {
        s.dices.forEach(d => {
            diceFreq[d]++;
            totalDice++;
        });
    });
    
    const probs = diceFreq.map(f => f / totalDice);
    const entropy = probs.reduce((sum, p) => p > 0 ? sum - p * Math.log2(p) : sum, 0);
    const maxEntropy = Math.log2(6);
    const bias = 1 - (entropy / maxEntropy); // 0 = random, 1 = heavily biased
    
    // Tìm mặt xuất hiện nhiều nhất
    let maxFace = 1;
    for (let i = 2; i <= 6; i++) {
        if (diceFreq[i] > diceFreq[maxFace]) maxFace = i;
    }
    
    return {
        diceProbs: probs,
        bias: bias,
        dominantFace: maxFace,
        dominantFreq: diceFreq[maxFace] / totalDice
    };
}

// Phân tích streak (dây)
function streakAnalysis(history) {
    let currentStreak = 1;
    const lastResult = history[history.length - 1];
    
    for (let i = history.length - 2; i >= 0; i--) {
        if (history[i] === lastResult) currentStreak++;
        else break;
    }
    
    // Tìm streak dài nhất
    let maxStreak = 1;
    let tempStreak = 1;
    for (let i = 1; i < history.length; i++) {
        if (history[i] === history[i - 1]) {
            tempStreak++;
            maxStreak = Math.max(maxStreak, tempStreak);
        } else {
            tempStreak = 1;
        }
    }
    
    // Xác suất đảo chiều dựa trên streak
    let reversalProb = 0.5;
    if (currentStreak >= 5) reversalProb = 0.7;
    else if (currentStreak >= 3) reversalProb = 0.6;
    else if (currentStreak >= 2) reversalProb = 0.55;
    
    return {
        currentStreak: currentStreak,
        maxStreak: maxStreak,
        lastResult: lastResult,
        reversalProb: reversalProb
    };
}

// ============================================
// HÀM DỰ ĐOÁN CHÍNH
// ============================================
function predictVIPP(sessions) {
    // Sắp xếp theo id tăng dần (cũ -> mới)
    const sorted = [...sessions].sort((a, b) => a.id - b.id);
    
    const history = sorted.map(s => s.resultTruyenThong); // ['TAI', 'XIU', ...]
    const points = sorted.map(s => s.point);
    
    // ID phiên dự đoán = max ID + 1
    const nextId = Math.max(...sorted.map(s => s.id)) + 1;
    
    // --------------------------------------------------
    // 1. Markov Chain bậc 2
    // --------------------------------------------------
    const markovProbs = markovChain(history, 2);
    let markovScore = { TAI: 0.5, XIU: 0.5 };
    let markovWeight = 0;
    if (markovProbs) {
        markovScore = markovProbs;
        markovWeight = 0.25;
    }
    
    // --------------------------------------------------
    // 2. Phân tích chu kỳ
    // --------------------------------------------------
    const cycle = cycleAnalysis(history);
    let cycleScore = { TAI: 0.5, XIU: 0.5 };
    let cycleWeight = 0;
    if (cycle && cycle.strength > 0.3) {
        // Dự đoán dựa trên chu kỳ
        const lagIndex = history.length - cycle.lag;
        if (lagIndex >= 0) {
            const predictedFromCycle = history[lagIndex];
            cycleScore[predictedFromCycle] = 0.5 + cycle.strength * 0.4;
            cycleScore[predictedFromCycle === 'TAI' ? 'XIU' : 'TAI'] = 1 - cycleScore[predictedFromCycle];
        }
        cycleWeight = 0.2 * Math.abs(cycle.strength);
    }
    
    // --------------------------------------------------
    // 3. Phân tích xu hướng điểm
    // --------------------------------------------------
    const trend = localTrendAnalysis(points);
    let trendScore = { TAI: 0.5, XIU: 0.5 };
    let trendWeight = 0;
    if (trend) {
        const predPoint = trend.predictedPoint;
        if (predPoint >= 11) {
            trendScore.TAI = 0.5 + trend.confidence;
            trendScore.XIU = 0.5 - trend.confidence;
        } else {
            trendScore.XIU = 0.5 + trend.confidence;
            trendScore.TAI = 0.5 - trend.confidence;
        }
        trendWeight = 0.25;
    }
    
    // --------------------------------------------------
    // 4. Phân tích dây (streak)
    // --------------------------------------------------
    const streak = streakAnalysis(history);
    let streakScore = { TAI: 0.5, XIU: 0.5 };
    const streakWeight = 0.15;
    
    if (streak.reversalProb > 0.5) {
        streakScore[streak.lastResult === 'TAI' ? 'XIU' : 'TAI'] = streak.reversalProb;
        streakScore[streak.lastResult] = 1 - streak.reversalProb;
    }
    
    // --------------------------------------------------
    // 5. Phân phối xúc xắc
    // --------------------------------------------------
    const diceAnalysis = diceDistributionAnalysis(sorted);
    let diceScore = { TAI: 0.5, XIU: 0.5 };
    const diceWeight = 0.1;
    
    // Nếu có bias mạnh về mặt nào đó
    if (diceAnalysis.bias > 0.2) {
        const domFace = diceAnalysis.dominantFace;
        if (domFace >= 4) {
            diceScore.TAI = 0.5 + diceAnalysis.bias * 0.5;
            diceScore.XIU = 0.5 - diceAnalysis.bias * 0.5;
        } else {
            diceScore.XIU = 0.5 + diceAnalysis.bias * 0.5;
            diceScore.TAI = 0.5 - diceAnalysis.bias * 0.5;
        }
    }
    
    // --------------------------------------------------
    // 6. Phân tích mẫu đảo chiều
    // --------------------------------------------------
    const recent10 = history.slice(-10);
    let reversalCount = 0;
    for (let i = 1; i < recent10.length; i++) {
        if (recent10[i] !== recent10[i - 1]) reversalCount++;
    }
    const reversalRate = reversalCount / (recent10.length - 1);
    let reversalScore = { TAI: 0.5, XIU: 0.5 };
    const reversalWeight = 0.05;
    
    if (reversalRate > 0.6) {
        // Nhiều đảo chiều -> dự đoán đảo chiều tiếp
        reversalScore[history[history.length - 1] === 'TAI' ? 'XIU' : 'TAI'] = reversalRate;
        reversalScore[history[history.length - 1]] = 1 - reversalRate;
    }
    
    // --------------------------------------------------
    // TỔNG HỢP ENSEMBLE
    // --------------------------------------------------
    const weights = {
        markov: markovWeight,
        cycle: cycleWeight,
        trend: trendWeight,
        streak: streakWeight,
        dice: diceWeight,
        reversal: reversalWeight
    };
    
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    
    let finalTAI = 0;
    let finalXIU = 0;
    
    const components = [
        { score: markovScore, w: weights.markov },
        { score: cycleScore, w: weights.cycle },
        { score: trendScore, w: weights.trend },
        { score: streakScore, w: weights.streak },
        { score: diceScore, w: weights.dice },
        { score: reversalScore, w: weights.reversal }
    ];
    
    components.forEach(c => {
        if (c.w > 0) {
            finalTAI += c.score.TAI * (c.w / totalWeight);
            finalXIU += c.score.XIU * (c.w / totalWeight);
        }
    });
    
    // Chuẩn hóa
    const sum = finalTAI + finalXIU;
    finalTAI /= sum;
    finalXIU /= sum;
    
    const prediction = finalTAI >= finalXIU ? 'TAI' : 'XIU';
    const confidence = Math.max(finalTAI, finalXIU) * 100;
    
    // Điểm tổng hợp dự đoán (cho 3 xúc xắc)
    const avgPoint = points.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, points.length);
    const predictedPoint = trend ? trend.predictedPoint : avgPoint;
    
    return {
        nextSessionId: nextId,
        prediction: prediction,
        confidence: Math.round(confidence * 100) / 100,
        predictedPoint: Math.round(predictedPoint * 100) / 100,
        details: {
            markov: { score: markovScore, weight: markovWeight },
            cycle: { score: cycleScore, weight: cycleWeight, lag: cycle?.lag, strength: cycle?.strength },
            trend: { score: trendScore, weight: trendWeight, slope: trend?.slope, trend: trend?.trend },
            streak: { score: streakScore, weight: streakWeight, current: streak.currentStreak, reversalProb: streak.reversalProb },
            dice: { score: diceScore, weight: diceWeight, bias: diceAnalysis.bias, dominantFace: diceAnalysis.dominantFace },
            reversal: { score: reversalScore, weight: reversalWeight, rate: reversalRate }
        },
        rawScores: { TAI: finalTAI, XIU: finalXIU }
    };
}

// ============================================
// HÀM GỌI API & CHẠY LIÊN TỤC
// ============================================
async function fetchAndPredict() {
    try {
        const response = await axios.get(API_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        
        const data = response.data;
        const sessions = data.list || data;
        
        if (!sessions || sessions.length === 0) {
            console.log('[!] Không có dữ liệu sessions');
            return null;
        }
        
        const result = predictVIPP(sessions);
        
        // In kết quả đẹp
        console.log('\n' + '='.repeat(60));
        console.log('🎯  DỰ ĐOÁN PHIÊN TIẾP THEO');
        console.log('='.repeat(60));
        console.log(`📋  Phiên dự đoán:     #${result.nextSessionId}`);
        console.log(`🎲  Dự đoán:           ${result.prediction}`);
        console.log(`📊  Độ tin cậy:        ${result.confidence}%`);
        console.log(`🎯  Điểm dự đoán:      ${result.predictedPoint}`);
        console.log(`📈  Xác suất TAI:      ${(result.rawScores.TAI * 100).toFixed(2)}%`);
        console.log(`📉  Xác suất XIU:      ${(result.rawScores.XIU * 100).toFixed(2)}%`);
        console.log('-'.repeat(60));
        console.log('Chi tiết các thành phần:');
        console.log(`  Markov (w=${result.details.markov.weight.toFixed(2)}):   TAI=${(result.details.markov.score.TAI*100).toFixed(1)}% XIU=${(result.details.markov.score.XIU*100).toFixed(1)}%`);
        console.log(`  Cycle  (w=${result.details.cycle.weight.toFixed(2)}):   TAI=${(result.details.cycle.score.TAI*100).toFixed(1)}% XIU=${(result.details.cycle.score.XIU*100).toFixed(1)}% | lag=${result.details.cycle.lag} str=${result.details.cycle.strength?.toFixed(2)}`);
        console.log(`  Trend  (w=${result.details.trend.weight.toFixed(2)}):   TAI=${(result.details.trend.score.TAI*100).toFixed(1)}% XIU=${(result.details.trend.score.XIU*100).toFixed(1)}% | slope=${result.details.trend.slope?.toFixed(2)} ${result.details.trend.trend}`);
        console.log(`  Streak (w=${result.details.streak.weight.toFixed(2)}):   TAI=${(result.details.streak.score.TAI*100).toFixed(1)}% XIU=${(result.details.streak.score.XIU*100).toFixed(1)}% | streak=${result.details.streak.current}`);
        console.log(`  Dice   (w=${result.details.dice.weight.toFixed(2)}):   TAI=${(result.details.dice.score.TAI*100).toFixed(1)}% XIU=${(result.details.dice.score.XIU*100).toFixed(1)}% | bias=${result.details.dice.bias?.toFixed(2)}`);
        console.log(`  Rev    (w=${result.details.reversal.weight.toFixed(2)}):   TAI=${(result.details.reversal.score.TAI*100).toFixed(1)}% XIU=${(result.details.reversal.score.XIU*100).toFixed(1)}% | rate=${result.details.reversal.rate?.toFixed(2)}`);
        console.log('='.repeat(60) + '\n');
        
        return result;
        
    } catch (error) {
        console.error('[!] Lỗi fetch API:', error.message);
        return null;
    }
}

// ============================================
// MAIN - CHẠY LIÊN TỤC
// ============================================
async function main() {
    console.log('🚀  VIPP PREDICTION ENGINE STARTED');
    console.log(`🔗  API: ${API_URL}`);
    console.log(`⏱️   Interval: ${INTERVAL_MS}ms\n`);
    
    // Chạy ngay lần đầu
    await fetchAndPredict();
    
    // Lặp theo interval
    setInterval(async () => {
        await fetchAndPredict();
    }, INTERVAL_MS);
}

// Chạy
main();
