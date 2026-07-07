
// ============================================
// SUPER VIP AI PREDICTOR - TÀI XỈU
// Node.js Server + Render Engine
// ============================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// ============================================
// CONFIG
// ============================================
const CONFIG = {
    API_BASE: 'https://wtxmd52.tele68.com/v1/txmd5',
    PORT: 8080,
    UPDATE_INTERVAL: 5000, // 5 giây cập nhật 1 lần
    MAX_HISTORY: 100
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
class MathUtils {
    static mean(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    static std(arr) {
        if (!arr || arr.length < 2) return 0;
        const mean = MathUtils.mean(arr);
        const variance = arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (arr.length - 1);
        return Math.sqrt(variance);
    }

    static median(arr) {
        if (!arr || arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return sorted[mid];
    }

    static normalRandom(mean = 0, std = 1) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    static weightedRandom(weights) {
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        for (let i = 0; i < weights.length; i++) {
            random -= weights[i];
            if (random <= 0) return i;
        }
        return weights.length - 1;
    }
}

// ============================================
// DATA FETCHER
// ============================================
class DataFetcher {
    static async fetchJSON(url) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            protocol.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    static async fetchHistory() {
        try {
            const data = await DataFetcher.fetchJSON(`${CONFIG.API_BASE}/sessions`);
            return data;
        } catch (error) {
            console.error('Lỗi fetch history:', error.message);
            return null;
        }
    }
}

// ============================================
// ALGORITHM 1: NEURAL WEIGHTED PREDICTION
// ============================================
class NeuralWeightedPredictor {
    static predict(data) {
        if (data.length < 3) return { prediction: 'TAI', confidence: 50 };

        const weights = { recent_3: 0.35, recent_5: 0.25, recent_10: 0.20, overall: 0.10, pattern: 0.10 };
        let scores = { TAI: 0, XIU: 0 };

        // 3 phiên gần nhất
        if (data.length >= 3) {
            const recent3 = data.slice(0, 3);
            const tai3 = recent3.filter(d => d.result === 'TAI').length / 3;
            scores.TAI += tai3 * weights.recent_3;
            scores.XIU += (1 - tai3) * weights.recent_3;
        }

        // 5 phiên
        if (data.length >= 5) {
            const recent5 = data.slice(0, 5);
            const tai5 = recent5.filter(d => d.result === 'TAI').length / 5;
            scores.TAI += tai5 * weights.recent_5;
            scores.XIU += (1 - tai5) * weights.recent_5;
        }

        // 10 phiên
        if (data.length >= 10) {
            const recent10 = data.slice(0, 10);
            const tai10 = recent10.filter(d => d.result === 'TAI').length / 10;
            scores.TAI += tai10 * weights.recent_10;
            scores.XIU += (1 - tai10) * weights.recent_10;
        }

        // Tổng thể
        const allTai = data.filter(d => d.result === 'TAI').length / data.length;
        scores.TAI += allTai * weights.overall;
        scores.XIU += (1 - allTai) * weights.overall;

        const prediction = scores.TAI > scores.XIU ? 'TAI' : 'XIU';
        const confidence = Math.round((Math.max(scores.TAI, scores.XIU) / (scores.TAI + scores.XIU)) * 100);

        return { prediction, confidence, scores };
    }
}

// ============================================
// ALGORITHM 2: MARKOV CHAIN ANALYSIS
// ============================================
class MarkovChainPredictor {
    static buildTransitionMatrix(data, order = 2) {
        if (data.length < order + 1) return null;

        const transitions = {};
        const results = data.map(d => d.result);

        for (let i = 0; i < results.length - order; i++) {
            const state = results.slice(i, i + order).join(',');
            const nextState = results[i + order];

            if (!transitions[state]) {
                transitions[state] = { TAI: 0, XIU: 0, total: 0 };
            }
            transitions[state][nextState]++;
            transitions[state].total++;
        }

        // Convert to probabilities
        const probabilities = {};
        for (const [state, counts] of Object.entries(transitions)) {
            probabilities[state] = {
                TAI: counts.TAI / counts.total,
                XIU: counts.XIU / counts.total
            };
        }

        return probabilities;
    }

    static predict(data) {
        if (data.length < 3) return { prediction: 'TAI', confidence: 50 };

        const probs = MarkovChainPredictor.buildTransitionMatrix(data, 2);
        if (!probs) return { prediction: 'TAI', confidence: 50 };

        const currentState = data.slice(0, 2).map(d => d.result).join(',');
        const stateProbs = probs[currentState];

        if (!stateProbs) return { prediction: 'TAI', confidence: 50 };

        const prediction = stateProbs.TAI > stateProbs.XIU ? 'TAI' : 'XIU';
        const confidence = Math.round(Math.max(stateProbs.TAI, stateProbs.XIU) * 100);

        return { prediction, confidence, probabilities: stateProbs };
    }
}

// ============================================
// ALGORITHM 3: FIBONACCI RETRACEMENT
// ============================================
class FibonacciPredictor {
    static predict(data) {
        const fib = [1, 1, 2, 3, 5, 8, 13, 21, 34];
        let scores = { TAI: 0, XIU: 0 };

        for (const f of fib) {
            if (f <= data.length) {
                const result = data[f - 1].result;
                scores[result]++;
            }
        }

        const total = scores.TAI + scores.XIU;
        if (total === 0) return { prediction: 'TAI', confidence: 50 };

        const prediction = scores.TAI > scores.XIU ? 'TAI' : 'XIU';
        const confidence = Math.round((Math.max(scores.TAI, scores.XIU) / total) * 100);

        return { prediction, confidence, scores };
    }
}

// ============================================
// ALGORITHM 4: ENTROPY ANALYSIS
// ============================================
class EntropyPredictor {
    static calculateEntropy(data, windowSize = 3) {
        if (data.length < windowSize) return 0;

        const results = data.map(d => d.result);
        const patterns = new Set();

        for (let i = 0; i <= results.length - windowSize; i++) {
            patterns.add(results.slice(i, i + windowSize).join(','));
        }

        const maxPatterns = Math.pow(2, windowSize);
        return patterns.size / Math.min(maxPatterns, results.length - windowSize + 1);
    }

    static predict(data) {
        if (data.length < 5) return { prediction: 'TAI', confidence: 50 };

        const entropy = EntropyPredictor.calculateEntropy(data, 3);

        if (entropy > 0.7) {
            // High entropy - random, use recent trend
            const recent = data.slice(0, 10);
            const taiCount = recent.filter(d => d.result === 'TAI').length;
            const prediction = taiCount > 5 ? 'TAI' : 'XIU';
            return { prediction, confidence: Math.round(Math.abs(taiCount - 5) * 10 + 50), entropy };
        } else {
            // Low entropy - follow pattern
            const recent = data.slice(0, 5);
            const taiCount = recent.filter(d => d.result === 'TAI').length;
            const prediction = taiCount >= 3 ? 'TAI' : 'XIU';
            return { prediction, confidence: Math.round(Math.abs(taiCount - 2.5) * 20 + 50), entropy };
        }
    }
}

// ============================================
// ALGORITHM 5: REVERSE PSYCHOLOGY
// ============================================
class ReversePsychologyPredictor {
    static predict(data) {
        if (data.length < 7) return { prediction: 'TAI', confidence: 50 };

        const recent7 = data.slice(0, 7);
        const taiCount = recent7.filter(d => d.result === 'TAI').length;

        let prediction, confidence;
        if (taiCount >= 5) {
            prediction = 'XIU';
            confidence = Math.round((taiCount / 7) * 100);
        } else if (taiCount <= 2) {
            prediction = 'TAI';
            confidence = Math.round(((7 - taiCount) / 7) * 100);
        } else {
            prediction = Math.random() > 0.5 ? 'TAI' : 'XIU';
            confidence = 50;
        }

        return { prediction, confidence, recentTaiRatio: taiCount / 7 };
    }
}

// ============================================
// ALGORITHM 6: BAYESIAN INFERENCE
// ============================================
class BayesianPredictor {
    static predict(data) {
        if (data.length < 5) return { prediction: 'TAI', confidence: 50 };

        const priorTAI = 0.5;
        const priorXIU = 0.5;

        const recent = data.slice(0, Math.min(10, data.length));
        const taiRecent = recent.filter(d => d.result === 'TAI').length / recent.length;
        const xiuRecent = 1 - taiRecent;

        const posteriorTAI = priorTAI * taiRecent;
        const posteriorXIU = priorXIU * xiuRecent;
        const total = posteriorTAI + posteriorXIU;

        const probTAI = posteriorTAI / total;
        const probXIU = posteriorXIU / total;

        const prediction = probTAI > probXIU ? 'TAI' : 'XIU';
        const confidence = Math.round(Math.max(probTAI, probXIU) * 100);

        return { prediction, confidence, probabilities: { TAI: probTAI, XIU: probXIU } };
    }
}

// ============================================
// ALGORITHM 7: MONTE CARLO SIMULATION
// ============================================
class MonteCarloPredictor {
    static predict(data, simulations = 1000) {
        if (data.length < 10) return { prediction: 'TAI', confidence: 50 };

        const points = data.map(d => d.point);
        const mean = MathUtils.mean(points);
        const std = MathUtils.std(points);

        let taiWins = 0;
        let xiuWins = 0;

        for (let i = 0; i < simulations; i++) {
            const simulatedPoint = MathUtils.clamp(
                MathUtils.normalRandom(mean, std),
                3, 18
            );

            if (simulatedPoint >= 11) taiWins++;
            else xiuWins++;
        }

        const prediction = taiWins > xiuWins ? 'TAI' : 'XIU';
        const confidence = Math.round((Math.max(taiWins, xiuWins) / simulations) * 100);

        return { prediction, confidence, simulatedRatio: { TAI: taiWins / simulations, XIU: xiuWins / simulations } };
    }
}

// ============================================
// ALGORITHM 8: GOLDEN RATIO PREDICTION
// ============================================
class GoldenRatioPredictor {
    static predict(data) {
        if (data.length < 10) return { prediction: 'TAI', confidence: 50 };

        const phi = (1 + Math.sqrt(5)) / 2;
        const indices = [0];
        
        while (indices[indices.length - 1] + phi < data.length) {
            indices.push(Math.floor(indices[indices.length - 1] + phi));
        }

        const goldenResults = indices
            .filter(i => i < data.length)
            .map(i => data[i].result);

        const taiCount = goldenResults.filter(r => r === 'TAI').length;
        const xiuCount = goldenResults.filter(r => r === 'XIU').length;
        const total = taiCount + xiuCount;

        if (total === 0) return { prediction: 'TAI', confidence: 50 };

        const prediction = taiCount > xiuCount ? 'TAI' : 'XIU';
        const confidence = Math.round((Math.max(taiCount, xiuCount) / total) * 100);

        return { prediction, confidence, goldenSamples: indices.length };
    }
}

// ============================================
// ALGORITHM 9: CHAOS THEORY PREDICTION
// ============================================
class ChaosTheoryPredictor {
    static predict(data) {
        if (data.length < 15) return { prediction: 'TAI', confidence: 50 };

        const points = data.map(d => d.point);
        const diffs = [];

        for (let i = 1; i < points.length; i++) {
            diffs.push(Math.abs(points[i] - points[i - 1]));
        }

        const avgDiff = MathUtils.mean(diffs);

        if (avgDiff < 2.5) {
            // Hệ thống ổn định - theo xu hướng
            const recent3 = data.slice(0, 3);
            const taiCount = recent3.filter(d => d.result === 'TAI').length;
            const prediction = taiCount >= 2 ? 'TAI' : 'XIU';
            return { prediction, confidence: 60 + Math.round(avgDiff * 10), avgDiff };
        } else {
            // Hỗn loạn - đảo chiều
            const lastResult = data[0].result;
            const prediction = lastResult === 'TAI' ? 'XIU' : 'TAI';
            return { prediction, confidence: 60 + Math.round((4 - avgDiff) * 10), avgDiff };
        }
    }
}

// ============================================
// ALGORITHM 10: STREAK MOMENTUM
// ============================================
class StreakMomentumPredictor {
    static analyze(data) {
        if (data.length === 0) return { currentStreak: 0, currentType: 'TAI' };

        let currentStreak = 1;
        const currentType = data[0].result;

        for (let i = 1; i < data.length; i++) {
            if (data[i].result === currentType) {
                currentStreak++;
            } else {
                break;
            }
        }

        return { currentStreak, currentType };
    }

    static predict(data) {
        const streak = StreakMomentumPredictor.analyze(data);

        if (streak.currentStreak >= 4) {
            // Chuỗi dài - khả năng đảo chiều cao
            const prediction = streak.currentType === 'TAI' ? 'XIU' : 'TAI';
            const confidence = Math.min(90, 50 + streak.currentStreak * 10);
            return { prediction, confidence, ...streak };
        } else if (streak.currentStreak >= 2) {
            // Chuỗi vừa - tiếp tục xu hướng
            const prediction = streak.currentType;
            const confidence = 50 + streak.currentStreak * 5;
            return { prediction, confidence, ...streak };
        } else {
            return { prediction: streak.currentType, confidence: 50, ...streak };
        }
    }
}

// ============================================
// ALGORITHM 11: POINT DISTRIBUTION ANALYSIS
// ============================================
class PointDistributionPredictor {
    static predict(data) {
        if (data.length < 10) return { prediction: 'TAI', confidence: 50 };

        const points = data.map(d => d.point);
        const mean = MathUtils.mean(points);
        const std = MathUtils.std(points);
        const median = MathUtils.median(points);

        // Sử dụng độ lệch để dự đoán
        const recentPoints = data.slice(0, 5).map(d => d.point);
        const recentMean = MathUtils.mean(recentPoints);

        let prediction, confidence;

        if (recentMean > mean + std * 0.5) {
            // Điểm cao hơn trung bình - dự đoán về trung bình
            prediction = 'XIU';
            confidence = Math.round(Math.min(80, 50 + ((recentMean - mean) / std) * 30));
        } else if (recentMean < mean - std * 0.5) {
            // Điểm thấp hơn trung bình - dự đoán về trung bình
            prediction = 'TAI';
            confidence = Math.round(Math.min(80, 50 + ((mean - recentMean) / std) * 30));
        } else {
            // Gần trung bình - theo xu hướng gần nhất
            const lastResult = data[0].result;
            prediction = lastResult;
            confidence = 55;
        }

        return { prediction, confidence, statistics: { mean, std, median, recentMean } };
    }
}

// ============================================
// ALGORITHM 12: CYCLE DETECTION
// ============================================
class CycleDetectionPredictor {
    static detectCycle(data, maxCycle = 10) {
        if (data.length < 20) return null;

        const results = data.map(d => d.result);
        let bestCycle = null;
        let bestAccuracy = 0;

        for (let cycleLen = 2; cycleLen <= maxCycle; cycleLen++) {
            let correct = 0;
            let total = 0;

            for (let i = cycleLen; i < results.length; i++) {
                if (results[i] === results[i % cycleLen]) {
                    correct++;
                }
                total++;
            }

            const accuracy = total > 0 ? correct / total : 0;

            if (accuracy > bestAccuracy) {
                bestAccuracy = accuracy;
                bestCycle = cycleLen;
            }
        }

        if (bestAccuracy > 0.55) {
            return {
                cycleLength: bestCycle,
                accuracy: bestAccuracy,
                nextPrediction: results[results.length % bestCycle]
            };
        }

        return null;
    }

    static predict(data) {
        const cycle = CycleDetectionPredictor.detectCycle(data);

        if (cycle) {
            return {
                prediction: cycle.nextPrediction,
                confidence: Math.round(cycle.accuracy * 100),
                cycle
            };
        }

        return { prediction: 'TAI', confidence: 50, cycle: null };
    }
}

// ============================================
// ENSEMBLE PREDICTOR - TỔNG HỢP TẤT CẢ THUẬT TOÁN
// ============================================
class EnsemblePredictor {
    static predict(data) {
        const predictors = [
            { name: 'Neural Weighted', predictor: NeuralWeightedPredictor, weight: 0.18 },
            { name: 'Markov Chain', predictor: MarkovChainPredictor, weight: 0.12 },
            { name: 'Fibonacci', predictor: FibonacciPredictor, weight: 0.08 },
            { name: 'Entropy', predictor: EntropyPredictor, weight: 0.12 },
            { name: 'Reverse Psychology', predictor: ReversePsychologyPredictor, weight: 0.08 },
            { name: 'Bayesian', predictor: BayesianPredictor, weight: 0.10 },
            { name: 'Monte Carlo', predictor: MonteCarloPredictor, weight: 0.10 },
            { name: 'Golden Ratio', predictor: GoldenRatioPredictor, weight: 0.05 },
            { name: 'Chaos Theory', predictor: ChaosTheoryPredictor, weight: 0.05 },
            { name: 'Streak Momentum', predictor: StreakMomentumPredictor, weight: 0.07 },
            { name: 'Point Distribution', predictor: PointDistributionPredictor, weight: 0.03 },
            { name: 'Cycle Detection', predictor: CycleDetectionPredictor, weight: 0.02 }
        ];

        const results = [];
        let totalWeight = 0;
        let scores = { TAI: 0, XIU: 0 };

        for (const { name, predictor, weight } of predictors) {
            try {
                const result = predictor.predict(data);
                results.push({ name, ...result, weight });
                scores[result.prediction] += weight * (result.confidence / 100);
                totalWeight += weight;
            } catch (e) {
                console.error(`Lỗi predictor ${name}:`, e.message);
            }
        }

        // Chuẩn hóa scores
        if (totalWeight > 0) {
            scores.TAI /= totalWeight;
            scores.XIU /= totalWeight;
        }

        const prediction = scores.TAI > scores.XIU ? 'TAI' : 'XIU';
        const confidence = Math.round(
            (Math.max(scores.TAI, scores.XIU) / (scores.TAI + scores.XIU)) * 100
        );

        return {
            prediction,
            confidence,
            scores: {
                TAI: Math.round(scores.TAI * 100),
                XIU: Math.round(scores.XIU * 100)
            },
            individualResults: results
        };
    }
}

// ============================================
// MAIN PREDICTOR CLASS
// ============================================
class SuperVIPPredictor {
    constructor() {
        this.sessionData = null;
        this.history = [];
        this.lastPrediction = null;
        this.stats = { TAI: 0, XIU: 0 };
    }

    async fetchHistory() {
        const data = await DataFetcher.fetchHistory();
        if (data && data.list) {
            this.sessionData = data;
            this.history = data.list.map(session => ({
                id: session.id,
                result: session.resultTruyenThong,
                dices: session.dices,
                point: session.point
            }));
            this.stats = data.typeStat || { TAI: 0, XIU: 0 };
            return true;
        }
        return false;
    }

    predict() {
        if (this.history.length === 0) {
            return { prediction: 'TAI', confidence: 50, error: 'Không có dữ liệu' };
        }

        const ensembleResult = EnsemblePredictor.predict(this.history);
        const nextId = this.history.length > 0 ? this.history[0].id + 1 : 1;

        this.lastPrediction = {
            id: nextId,
            timestamp: new Date().toISOString(),
            ...ensembleResult,
            stats: this.stats,
            historyCount: this.history.length
        };

        return this.lastPrediction;
    }

    async predictAndReturn() {
        await this.fetchHistory();
        return this.predict();
    }
}

// ============================================
// HTML TEMPLATE - GIAO DIỆN WEB
// ============================================
function getHTMLTemplate(predictionData, historyData) {
    const duDoan = predictionData || {};
    const history = historyData || [];
    
    const historyRows = history.slice(0, 50).map((item, index) => {
        const resultColor = item.result === 'TAI' ? '#00ff88' : '#ff4444';
        const resultBg = item.result === 'TAI' ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)';
        const dicesStr = item.dices ? item.dices.join(', ') : 'N/A';
        
        return `
            <tr style="background: ${index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'}">
                <td style="color: #888;">#${item.id}</td>
                <td style="color: ${resultColor}; font-weight: bold;">${item.result}</td>
                <td style="color: #ffd700;">${item.point}</td>
                <td style="color: #ccc;">[${dicesStr}]</td>
            </tr>
        `;
    }).join('');

    const individualAlgoHTML = duDoan.individualResults ? duDoan.individualResults.map(algo => {
        const algoColor = algo.prediction === 'TAI' ? '#00ff88' : '#ff4444';
        return `
            <div class="algo-item">
                <span class="algo-name">${algo.name}</span>
                <span class="algo-prediction" style="color: ${algoColor};">${algo.prediction}</span>
                <span class="algo-confidence">${algo.confidence || 0}%</span>
                <div class="algo-bar">
                    <div class="algo-bar-fill" style="width: ${algo.confidence || 0}%; background: ${algoColor};"></div>
                </div>
            </div>
        `;
    }).join('') : '';

    const predictionColor = duDoan.prediction === 'TAI' ? '#00ff88' : '#ff4444';
    const predictionGlow = duDoan.prediction === 'TAI' ? '0 0 30px rgba(0,255,136,0.5)' : '0 0 30px rgba(255,68,68,0.5)';

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔮 SUPER VIP AI PREDICTOR - TÀI XỈU</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        @keyframes glow {
            0%, 100% { box-shadow: ${predictionGlow}; }
            50% { box-shadow: 0 0 50px ${duDoan.prediction === 'TAI' ? 'rgba(0,255,136,0.8)' : 'rgba(255,68,68,0.8)'}; }
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes gradientBG {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        body {
            font-family: 'Segoe UI', 'Courier New', monospace;
            background: linear-gradient(135deg, #0a0a0a, #1a1a2e, #16213e, #0a0a0a);
            background-size: 400% 400%;
            animation: gradientBG 15s ease infinite;
            color: #fff;
            min-height: 100vh;
            overflow-x: hidden;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            padding: 30px 0;
            animation: slideIn 0.8s ease;
        }
        
        .header h1 {
            font-size: 2.5em;
            background: linear-gradient(45deg, #ffd700, #ff6b6b, #00ff88, #ffd700);
            background-size: 300% 300%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: gradientBG 3s ease infinite;
            text-shadow: none;
        }
        
        .header .subtitle {
            color: #888;
            font-size: 0.9em;
            margin-top: 10px;
        }
        
        .main-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
        }
        
        @media (max-width: 768px) {
            .main-grid {
                grid-template-columns: 1fr;
            }
            .header h1 {
                font-size: 1.5em;
            }
        }
        
        .card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            padding: 25px;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }
        
        .card:hover {
            border-color: rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        
        .prediction-card {
            text-align: center;
            grid-column: 1 / -1;
            animation: slideIn 0.6s ease;
        }
        
        .prediction-result {
            font-size: 4em;
            font-weight: 900;
            margin: 20px 0;
            animation: pulse 2s ease-in-out infinite;
            letter-spacing: 5px;
        }
        
        .prediction-id {
            color: #ffd700;
            font-size: 1.2em;
            margin-bottom: 10px;
        }
        
        .confidence-bar {
            width: 100%;
            height: 30px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }
        
        .confidence-fill {
            height: 100%;
            border-radius: 15px;
            transition: width 1s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 0.9em;
        }
        
        .score-row {
            display: flex;
            justify-content: space-around;
            margin: 20px 0;
        }
        
        .score-item {
            text-align: center;
        }
        
        .score-value {
            font-size: 2em;
            font-weight: bold;
        }
        
        .score-label {
            color: #888;
            font-size: 0.8em;
        }
        
        .section-title {
            color: #ffd700;
            font-size: 1.2em;
            margin-bottom: 15px;
            border-bottom: 1px solid rgba(255, 215, 0, 0.3);
            padding-bottom: 10px;
        }
        
        .algo-item {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 0.85em;
        }
        
        .algo-name {
            flex: 1;
            color: #aaa;
        }
        
        .algo-prediction {
            width: 50px;
            font-weight: bold;
            text-align: center;
        }
        
        .algo-confidence {
            width: 50px;
            text-align: right;
            color: #888;
        }
        
        .algo-bar {
            width: 80px;
            height: 5px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
            margin-left: 10px;
            overflow: hidden;
        }
        
        .algo-bar-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.5s ease;
        }
        
        .history-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.85em;
        }
        
        .history-table th {
            color: #ffd700;
            padding: 12px 8px;
            text-align: left;
            border-bottom: 2px solid rgba(255, 215, 0, 0.3);
            position: sticky;
            top: 0;
            background: rgba(10, 10, 10, 0.95);
        }
        
        .history-table td {
            padding: 10px 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .history-scroll {
            max-height: 500px;
            overflow-y: auto;
            border-radius: 10px;
        }
        
        .history-scroll::-webkit-scrollbar {
            width: 5px;
        }
        
        .history-scroll::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
        }
        
        .history-scroll::-webkit-scrollbar-thumb {
            background: rgba(255, 215, 0, 0.3);
            border-radius: 10px;
        }
        
        .stats-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            margin: 5px;
            font-size: 0.85em;
            font-weight: bold;
        }
        
        .badge-tai {
            background: rgba(0, 255, 136, 0.2);
            color: #00ff88;
            border: 1px solid rgba(0, 255, 136, 0.3);
        }
        
        .badge-xiu {
            background: rgba(255, 68, 68, 0.2);
            color: #ff4444;
            border: 1px solid rgba(255, 68, 68, 0.3);
        }
        
        .refresh-btn {
            background: linear-gradient(45deg, #ffd700, #ffaa00);
            color: #000;
            border: none;
            padding: 15px 30px;
            border-radius: 25px;
            font-size: 1em;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 20px auto;
            display: block;
        }
        
        .refresh-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 20px rgba(255, 215, 0, 0.4);
        }
        
        .timer {
            text-align: center;
            color: #888;
            font-size: 0.8em;
            margin-top: 10px;
        }
        
        .dice-display {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin: 15px 0;
        }
        
        .dice {
            width: 50px;
            height: 50px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5em;
            font-weight: bold;
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #555;
            font-size: 0.8em;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔮 SUPER VIP AI PREDICTOR</h1>
            <p class="subtitle">Hệ thống dự đoán TÀI/XỈU bằng 12 thuật toán AI</p>
            <p class="subtitle">Cập nhật mỗi 5 giây | <span id="current-time">--</span></p>
        </div>
        
        <div class="main-grid">
            <!-- DỰ ĐOÁN CHÍNH -->
            <div class="card prediction-card">
                <div class="prediction-id">🎯 Phiên #${duDoan.id || '---'}</div>
                <div class="prediction-result" style="color: ${predictionColor}; text-shadow: ${predictionGlow};">
                    ${duDoan.prediction || '---'}
                </div>
                
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width: ${duDoan.confidence || 0}%; background: ${predictionColor};">
                        ${duDoan.confidence || 0}% ĐỘ TIN CẬY
                    </div>
                </div>
                
                <div class="score-row">
                    <div class="score-item">
                        <div class="score-value" style="color: #00ff88;">${duDoan.scores ? duDoan.scores.TAI : 0}%</div>
                        <div class="score-label">TÀI</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value" style="color: #ffd700;">VS</div>
                        <div class="score-label">───</div>
                    </div>
                    <div class="score-item">
                        <div class="score-value" style="color: #ff4444;">${duDoan.scores ? duDoan.scores.XIU : 0}%</div>
                        <div class="score-label">XỈU</div>
                    </div>
                </div>
                
                <div style="margin-top: 20px;">
                    <span class="stats-badge badge-tai">TÀI: ${duDoan.stats ? duDoan.stats.TAI : 0}</span>
                    <span class="stats-badge badge-xiu">XỈU: ${duDoan.stats ? duDoan.stats.XIU : 0}</span>
                    <span class="stats-badge" style="background: rgba(255,215,0,0.2); color: #ffd700; border: 1px solid rgba(255,215,0,0.3);">
                        Tổng: ${(duDoan.stats ? (duDoan.stats.TAI || 0) + (duDoan.stats.XIU || 0) : 0)} phiên
                    </span>
                </div>
            </div>
            
            <!-- PHÂN TÍCH THUẬT TOÁN -->
            <div class="card">
                <div class="section-title">🧠 12 THUẬT TOÁN AI</div>
                ${individualAlgoHTML}
            </div>
            
            <!-- LỊCH SỬ -->
            <div class="card">
                <div class="section-title">📜 LỊCH SỬ PHIÊN (${history.length} phiên gần nhất)</div>
                <div class="history-scroll">
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>KẾT QUẢ</th>
                                <th>ĐIỂM</th>
                                <th>XÚC XẮC</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${historyRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <button class="refresh-btn" onclick="location.reload()">🔄 CẬP NHẬT DỰ ĐOÁN</button>
        <div class="timer">⏳ Tự động cập nhật sau <span id="countdown">5</span> giây</div>
        
        <div class="footer">
            <p>⚠️ Chỉ dùng tham khảo trong môi trường Lab kiểm thử bảo mật</p>
            <p>Super VIP AI Predictor v3.0 | Powered by 12 AI Algorithms</p>
        </div>
    </div>
    
    <script>
        // Auto refresh countdown
        let countdown = 5;
        const countdownEl = document.getElementById('countdown');
        const timeEl = document.getElementById('current-time');
        
        function updateTime() {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('vi-VN');
        }
        
        updateTime();
        setInterval(updateTime, 1000);
        
        setInterval(() => {
            countdown--;
            countdownEl.textContent = countdown;
            if (countdown <= 0) {
                location.reload();
            }
        }, 1000);
    </script>
</body>
</html>`;
}

// ============================================
// HTTP SERVER
// ============================================
class PredictionServer {
    constructor() {
        this.predictor = new SuperVIPPredictor();
        this.server = null;
    }

    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        try {
            if (pathname === '/' || pathname === '/index.html') {
                // Trang chính - Render giao diện
                await this.predictor.fetchHistory();
                const prediction = this.predictor.predict();
                const html = getHTMLTemplate(prediction, this.predictor.history);
                
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(html);
                
            } else if (pathname === '/api/predict') {
                // API JSON dự đoán
                const prediction = await this.predictor.predictAndReturn();
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    success: true,
                    data: prediction,
                    timestamp: new Date().toISOString()
                }, null, 2));
                
            } else if (pathname === '/api/history') {
                // API JSON lịch sử
                await this.predictor.fetchHistory();
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    success: true,
                    data: {
                        history: this.predictor.history.slice(0, 100),
                        stats: this.predictor.stats,
                        total: this.predictor.history.length
                    },
                    timestamp: new Date().toISOString()
                }, null, 2));
                
            } else {
                // 404
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 - Not Found</h1><p>Thử <a href="/">trang chủ</a></p>');
            }
            
        } catch (error) {
            console.error('Server error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: error.message }));
        }
    }

    start(port = CONFIG.PORT) {
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        
        this.server.listen(port, () => {
            console.log('╔══════════════════════════════════════════════╗');
            console.log('║   🔮 SUPER VIP AI PREDICTOR - TÀI XỈU     ║');
            console.log('╠══════════════════════════════════════════════╣');
            console.log(`║   🌐 Server: http://localhost:${port}          ║`);
            console.log(`║   📊 API: http://localhost:${port}/api/predict ║`);
            console.log(`║   📜 History: http://localhost:${port}/api/history ║`);
            console.log('║   🧠 12 Thuật toán AI Ensemble            ║');
            console.log('╚══════════════════════════════════════════════╝');
            
            // Tự động mở browser
            try {
                const { exec } = require('child_process');
                const platform = process.platform;
                let command;
                
                if (platform === 'win32') {
                    command = `start http://localhost:${port}`;
                } else if (platform === 'darwin') {
                    command = `open http://localhost:${port}`;
                } else {
                    command = `xdg-open http://localhost:${port}`;
                }
                
                exec(command);
            } catch (e) {
                console.log(`👉 Mở trình duyệt: http://localhost:${port}`);
            }
        });
    }
}

// ============================================
// START SERVER
// ============================================
const server = new PredictionServer();
server.start(CONFIG.PORT);

// Export cho module khác dùng
module.exports = {
    SuperVIPPredictor,
    EnsemblePredictor,
    NeuralWeightedPredictor,
    MarkovChainPredictor,
    FibonacciPredictor,
    EntropyPredictor,
    ReversePsychologyPredictor,
    BayesianPredictor,
    MonteCarloPredictor,
    GoldenRatioPredictor,
    ChaosTheoryPredictor,
    StreakMomentumPredictor,
    PointDistributionPredictor,
    CycleDetectionPredictor,
    PredictionServer,
    CONFIG
};
