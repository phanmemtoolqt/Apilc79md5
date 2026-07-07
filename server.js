const axios = require('axios');
const crypto = require('crypto');

// ============================================================
// SIÊU THUẬT TOÁN DỰ ĐOÁN TÀI XỈU VIP PRO MAX ULTRA
// Tích hợp: Markov bậc 3, Phân tích phổ, Monte Carlo, 
//           Mạng nơ-ron nhân tạo nhẹ, Phân tích Bayes,
//           Pattern Matching, Entropy, Hồi quy phi tuyến
// ============================================================

const API_URL = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
const WINDOW_SIZE = 50;
const PATTERN_DEPTH = 5;

// ============================================================
// TIỆN ÍCH TOÁN HỌC
// ============================================================
class MathUtils {
    static sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
    static tanh(x) { return Math.tanh(x); }
    static relu(x) { return Math.max(0, x); }
    static softmax(arr) {
        const max = Math.max(...arr);
        const exps = arr.map(x => Math.exp(x - max));
        const sum = exps.reduce((a, b) => a + b, 0);
        return exps.map(x => x / sum);
    }
    static mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
    static std(arr) {
        const m = MathUtils.mean(arr);
        return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length);
    }
    static entropy(arr) {
        const freq = {};
        arr.forEach(x => freq[x] = (freq[x] || 0) + 1);
        return -Object.values(freq).reduce((sum, f) => {
            const p = f / arr.length;
            return sum + p * Math.log2(p);
        }, 0);
    }
    static pearsonCorrelation(x, y) {
        const n = Math.min(x.length, y.length);
        const mx = MathUtils.mean(x.slice(0, n));
        const my = MathUtils.mean(y.slice(0, n));
        let num = 0, den1 = 0, den2 = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - mx, dy = y[i] - my;
            num += dx * dy;
            den1 += dx * dx;
            den2 += dy * dy;
        }
        return num / Math.sqrt(den1 * den2);
    }
}

// ============================================================
// PHÂN TÍCH MARKOV BẬC 3
// ============================================================
class MarkovChain3 {
    constructor() {
        this.transitions = {};
    }

    train(history) {
        this.transitions = {};
        for (let i = 0; i < history.length - 3; i++) {
            const key = history.slice(i, i + 3).join('_');
            const next = history[i + 3];
            if (!this.transitions[key]) this.transitions[key] = { TAI: 0, XIU: 0, total: 0 };
            this.transitions[key][next]++;
            this.transitions[key].total++;
        }
    }

    predict(last3) {
        const key = last3.join('_');
        if (this.transitions[key] && this.transitions[key].total > 0) {
            return {
                TAI: this.transitions[key].TAI / this.transitions[key].total,
                XIU: this.transitions[key].XIU / this.transitions[key].total,
                samples: this.transitions[key].total
            };
        }
        // Fallback về bậc 2
        const key2 = last3.slice(1).join('_');
        for (let k in this.transitions) {
            if (k.startsWith(key2) && this.transitions[k].total > 0) {
                return {
                    TAI: this.transitions[k].TAI / this.transitions[k].total,
                    XIU: this.transitions[k].XIU / this.transitions[k].total,
                    samples: this.transitions[k].total
                };
            }
        }
        return null;
    }
}

// ============================================================
// PHÂN TÍCH PHỔ (FFT ĐƠN GIẢN)
// ============================================================
class SpectralAnalysis {
    static analyze(binarySignal) {
        const n = binarySignal.length;
        if (n < 16) return { dominantFreq: 0, power: 0 };

        // DFT đơn giản
        const freqs = [];
        for (let k = 1; k <= Math.floor(n / 4); k++) {
            let real = 0, imag = 0;
            for (let t = 0; t < n; t++) {
                const angle = (2 * Math.PI * k * t) / n;
                real += binarySignal[t] * Math.cos(angle);
                imag -= binarySignal[t] * Math.sin(angle);
            }
            freqs.push({ freq: k, power: Math.sqrt(real * real + imag * imag) / n });
        }

        freqs.sort((a, b) => b.power - a.power);
        return {
            dominantFreq: freqs[0].freq,
            power: freqs[0].power,
            topFreqs: freqs.slice(0, 3)
        };
    }
}

// ============================================================
// MẠNG NƠ-RON NHÂN TẠO NHẸ (PERCEPTRON ĐA LỚP)
// ============================================================
class MiniNeuralNet {
    constructor(inputSize = 10, hiddenSize = 16) {
        // Khởi tạo trọng số ngẫu nhiên
        this.w1 = Array(inputSize).fill(0).map(() =>
            Array(hiddenSize).fill(0).map(() => (Math.random() - 0.5) * 0.5)
        );
        this.b1 = Array(hiddenSize).fill(0).map(() => (Math.random() - 0.5) * 0.1);
        this.w2 = Array(hiddenSize).fill(0).map(() => (Math.random() - 0.5) * 0.5);
        this.b2 = (Math.random() - 0.5) * 0.1;
    }

    forward(features) {
        // Lớp ẩn
        const hidden = this.w1.map((w, i) =>
            MathUtils.relu(features.reduce((sum, f, j) => sum + f * this.w1[j][i], 0) + this.b1[i])
        );
        // Lớp output
        const output = MathUtils.sigmoid(
            hidden.reduce((sum, h, i) => sum + h * this.w2[i], 0) + this.b2
        );
        return output;
    }

    train(features, target, lr = 0.01) {
        // Forward
        const hidden = this.w1.map((w, i) =>
            features.reduce((sum, f, j) => sum + f * this.w1[j][i], 0) + this.b1[i]
        );
        const hiddenAct = hidden.map(MathUtils.relu);
        const output = MathUtils.sigmoid(
            hiddenAct.reduce((sum, h, i) => sum + h * this.w2[i], 0) + this.b2
        );

        // Backward đơn giản (SGD)
        const error = target - output;
        const dOutput = error * output * (1 - output);

        // Cập nhật w2, b2
        for (let i = 0; i < this.w2.length; i++) {
            this.w2[i] += lr * dOutput * hiddenAct[i];
        }
        this.b2 += lr * dOutput;

        // Cập nhật w1, b1
        for (let i = 0; i < this.w1.length; i++) {
            for (let j = 0; j < this.w1[i].length; j++) {
                const dHidden = dOutput * this.w2[j] * (hidden[j] > 0 ? 1 : 0);
                this.w1[i][j] += lr * dHidden * features[i];
            }
        }
        for (let j = 0; j < this.b1.length; j++) {
            const dHidden = dOutput * this.w2[j] * (hidden[j] > 0 ? 1 : 0);
            this.b1[j] += lr * dHidden;
        }
    }
}

// ============================================================
// PHÂN TÍCH BAYES
// ============================================================
class BayesianAnalyzer {
    constructor() {
        this.prior = { TAI: 0.5, XIU: 0.5 };
    }

    update(likelihoodTAI, likelihoodXIU) {
        const posteriorTAI = this.prior.TAI * likelihoodTAI;
        const posteriorXIU = this.prior.XIU * likelihoodXIU;
        const sum = posteriorTAI + posteriorXIU;
        this.prior = {
            TAI: posteriorTAI / sum,
            XIU: posteriorXIU / sum
        };
        return this.prior;
    }

    reset() {
        this.prior = { TAI: 0.5, XIU: 0.5 };
    }
}

// ============================================================
// PATTERN MATCHING NÂNG CAO
// ============================================================
class PatternMatcher {
    static findSimilar(history, patternLength = PATTERN_DEPTH) {
        const lastPattern = history.slice(-patternLength);
        const matches = [];

        for (let i = 0; i < history.length - patternLength - 1; i++) {
            const candidate = history.slice(i, i + patternLength);
            let similarity = 0;
            for (let j = 0; j < patternLength; j++) {
                if (candidate[j] === lastPattern[j]) similarity++;
            }
            if (similarity >= patternLength - 1) {
                matches.push({
                    index: i,
                    similarity: similarity / patternLength,
                    nextResult: history[i + patternLength]
                });
            }
        }

        if (matches.length === 0) return null;

        const nextResults = matches.map(m => m.nextResult);
        const countTAI = nextResults.filter(r => r === 'TAI').length;
        const countXIU = nextResults.filter(r => r === 'XIU').length;

        return {
            TAI: countTAI / matches.length,
            XIU: countXIU / matches.length,
            matchCount: matches.length,
            avgSimilarity: matches.reduce((s, m) => s + m.similarity, 0) / matches.length
        };
    }
}

// ============================================================
// MONTE CARLO SIMULATION
// ============================================================
class MonteCarlo {
    static simulate(history, points, simulations = 1000) {
        const binaryHistory = history.map(h => h === 'TAI' ? 1 : 0);
        const mu = MathUtils.mean(binaryHistory);
        const sigma = MathUtils.std(binaryHistory) || 0.3;

        let taiWins = 0, xiuWins = 0;

        for (let i = 0; i < simulations; i++) {
            // Box-Muller transform
            const u1 = Math.random();
            const u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            const sample = mu + sigma * z;

            if (sample >= 0.5) taiWins++;
            else xiuWins++;
        }

        return {
            TAI: taiWins / simulations,
            XIU: xiuWins / simulations,
            mu,
            sigma
        };
    }
}

// ============================================================
// PHÂN TÍCH ENTROPY & ĐỘ HỖN LOẠN
// ============================================================
class ChaosAnalysis {
    static analyze(history) {
        const entropy = MathUtils.entropy(history);
        const maxEntropy = 1.0; // log2(2)
        const chaosLevel = entropy / maxEntropy; // 0 = deterministric, 1 = chaotic

        // Tính Lyapunov exponent thô
        const binary = history.map(h => h === 'TAI' ? 1 : 0);
        let divergence = 0;
        for (let i = 1; i < binary.length; i++) {
            if (binary[i] !== binary[i - 1]) divergence++;
        }
        const lyapunov = divergence / (binary.length - 1);

        return {
            entropy,
            chaosLevel,
            lyapunov,
            interpretation: chaosLevel > 0.8 ? 'random' : chaosLevel > 0.5 ? 'mixed' : 'predictable'
        };
    }
}

// ============================================================
// HỒI QUY PHI TUYẾN (POLYNOMIAL REGRESSION)
// ============================================================
class PolynomialRegression {
    static fit(x, y, degree = 2) {
        const n = x.length;
        // Ma trận Vandermonde
        const A = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let d = 0; d <= degree; d++) {
                row.push(Math.pow(x[i], d));
            }
            A.push(row);
        }

        // Giải A^T * A * coeff = A^T * y bằng Gaussian elimination đơn giản
        const AT = A[0].map((_, col) => A.map(row => row[col]));
        const ATA = AT.map(row => A[0].map((_, col) =>
            row.reduce((sum, val, k) => sum + val * A[k][col], 0)
        ));
        const ATy = AT.map(row =>
            row.reduce((sum, val, k) => sum + val * y[k], 0)
        );

        // Giải hệ phương trình
        const coeffs = this.gaussianElimination(ATA, ATy);
        return coeffs;
    }

    static gaussianElimination(A, b) {
        const n = A.length;
        const augmented = A.map((row, i) => [...row, b[i]]);

        for (let col = 0; col < n; col++) {
            let maxRow = col;
            for (let row = col + 1; row < n; row++) {
                if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
                    maxRow = row;
                }
            }
            [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

            for (let row = col + 1; row < n; row++) {
                const factor = augmented[row][col] / augmented[col][col];
                for (let j = col; j <= n; j++) {
                    augmented[row][j] -= factor * augmented[col][j];
                }
            }
        }

        const x = Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = augmented[i][n] / augmented[i][i];
            for (let j = i - 1; j >= 0; j--) {
                augmented[j][n] -= augmented[j][i] * x[i];
            }
        }
        return x;
    }

    static predict(coeffs, x) {
        return coeffs.reduce((sum, c, d) => sum + c * Math.pow(x, d), 0);
    }
}

// ============================================================
// TỔNG HỢP ENSEMBLE VỚI TRỌNG SỐ ĐỘNG
// ============================================================
class EnsemblePredictor {
    constructor() {
        this.markov = new MarkovChain3();
        this.bayesian = new BayesianAnalyzer();
        this.neuralNet = new MiniNeuralNet(10, 16);
        this.performanceHistory = {
            markov: { correct: 0, total: 0 },
            spectral: { correct: 0, total: 0 },
            pattern: { correct: 0, total: 0 },
            monteCarlo: { correct: 0, total: 0 },
            trend: { correct: 0, total: 0 },
            neural: { correct: 0, total: 0 },
            bayesian: { correct: 0, total: 0 }
        };
    }

    getDynamicWeights() {
        const weights = {};
        for (let key in this.performanceHistory) {
            const perf = this.performanceHistory[key];
            if (perf.total > 0) {
                weights[key] = perf.correct / perf.total;
            } else {
                weights[key] = 0.5;
            }
        }

        // Chuẩn hóa
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        for (let key in weights) {
            weights[key] /= total;
        }
        return weights;
    }

    updatePerformance(modelName, predicted, actual) {
        if (predicted === actual) {
            this.performanceHistory[modelName].correct++;
        }
        this.performanceHistory[modelName].total++;
    }
}

// ============================================================
// TRÍCH XUẤT ĐẶC TRƯNG (FEATURE ENGINEERING)
// ============================================================
class FeatureExtractor {
    static extract(history, points) {
        const n = history.length;
        const binary = history.map(h => h === 'TAI' ? 1 : 0);
        const recentN = Math.min(20, n);

        const features = [];

        // 1. Tỉ lệ TAI trong N phiên gần nhất
        const recentBinary = binary.slice(-recentN);
        features.push(MathUtils.mean(recentBinary));

        // 2. Độ lệch chuẩn gần đây
        features.push(MathUtils.std(recentBinary));

        // 3. Streak hiện tại (chuẩn hóa)
        let streak = 1;
        for (let i = n - 2; i >= 0; i--) {
            if (history[i] === history[n - 1]) streak++;
            else break;
        }
        features.push(Math.min(streak / 10, 1.0));

        // 4. Tỉ lệ đảo chiều
        let reversals = 0;
        for (let i = 1; i < n; i++) {
            if (binary[i] !== binary[i - 1]) reversals++;
        }
        features.push(reversals / (n - 1));

        // 5. Điểm trung bình gần đây
        const recentPoints = points.slice(-10);
        features.push((MathUtils.mean(recentPoints) - 3) / 15); // Chuẩn hóa về [0,1]

        // 6. Xu hướng điểm
        const x = Array.from({ length: Math.min(20, n) }, (_, i) => i);
        const y = points.slice(-Math.min(20, n));
        const slope = x.length > 1 ?
            (MathUtils.mean(y.slice(-5)) - MathUtils.mean(y.slice(0, 5))) / Math.min(20, n) : 0;
        features.push(MathUtils.sigmoid(slope));

        // 7. Entropy
        features.push(MathUtils.entropy(history.slice(-30)) || 0.5);

        // 8-10. Tương quan giữa các vị trí
        for (let lag of [1, 2, 3]) {
            if (n > lag + 5) {
                const shifted = binary.slice(0, -lag);
                const original = binary.slice(lag);
                const corr = MathUtils.pearsonCorrelation(original, shifted);
                features.push((corr + 1) / 2); // Chuẩn hóa về [0,1]
            } else {
                features.push(0.5);
            }
        }

        return features;
    }
}

// ============================================================
// HÀM DỰ ĐOÁN CHÍNH - TỔNG HỢP TẤT CẢ
// ============================================================
async function fetchData() {
    const res = await axios.get(API_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        },
        timeout: 15000
    });
    return res.data;
}

function du_doan_vip(data) {
    const sessions = data.list || data;
    const sorted = [...sessions].sort((a, b) => a.id - b.id);
    const history = sorted.map(s => s.resultTruyenThong);
    const points = sorted.map(s => s.point);
    const dices = sorted.map(s => s.dices);
    const nextId = sorted[sorted.length - 1].id + 1;

    // ==========================================
    // KHỞI TẠO CÁC BỘ PHÂN TÍCH
    // ==========================================
    const ensemble = new EnsemblePredictor();
    const binary = history.map(h => h === 'TAI' ? 1 : -1);

    // ==========================================
    // 1. MARKOV BẬC 3
    // ==========================================
    ensemble.markov.train(history);
    const last3 = history.slice(-3);
    const markovResult = ensemble.markov.predict(last3);
    let markovTAI = 0.5, markovXIU = 0.5, markovConf = 0.5;
    if (markovResult) {
        markovTAI = markovResult.TAI;
        markovXIU = markovResult.XIU;
        markovConf = Math.min(markovResult.samples / 20, 1.0);
    }

    // ==========================================
    // 2. PHÂN TÍCH PHỔ (SPECTRAL)
    // ==========================================
    const spectral = SpectralAnalysis.analyze(binary.slice(-64));
    let spectralTAI = 0.5, spectralXIU = 0.5, spectralConf = 0.3;
    if (spectral.power > 0.1) {
        const period = Math.round(history.length / spectral.dominantFreq);
        if (period > 0 && period < history.length) {
            const refIndex = history.length - period;
            if (refIndex >= 0) {
                spectralTAI = history[refIndex] === 'TAI' ? 0.7 : 0.3;
                spectralXIU = 1 - spectralTAI;
                spectralConf = Math.min(spectral.power * 2, 0.7);
            }
        }
    }

    // ==========================================
    // 3. PATTERN MATCHING
    // ==========================================
    const patternResult = PatternMatcher.findSimilar(history);
    let patternTAI = 0.5, patternXIU = 0.5, patternConf = 0.4;
    if (patternResult && patternResult.matchCount >= 2) {
        patternTAI = patternResult.TAI;
        patternXIU = patternResult.XIU;
        patternConf = Math.min(patternResult.matchCount / 10, 0.8);
    }

    // ==========================================
    // 4. MONTE CARLO
    // ==========================================
    const mc = MonteCarlo.simulate(history, points, 2000);
    const mcTAI = mc.TAI;
    const mcXIU = mc.XIU;
    const mcConf = 0.4 + Math.min(mc.sigma * 0.5, 0.3);

    // ==========================================
    // 5. PHÂN TÍCH XU HƯỚNG ĐIỂM
    // ==========================================
    const recentPts = points.slice(-20);
    const xVals = Array.from({ length: recentPts.length }, (_, i) => i);
    const polyCoeffs = PolynomialRegression.fit(xVals, recentPts, 2);
    const nextPoint = PolynomialRegression.predict(polyCoeffs, recentPts.length);
    const trendTAI = nextPoint >= 11 ? 0.6 : 0.4;
    const trendXIU = 1 - trendTAI;
    const trendConf = 0.5;

    // ==========================================
    // 6. NEURAL NETWORK
    // ==========================================
    const features = FeatureExtractor.extract(history, points);
    const neuralOutput = ensemble.neuralNet.forward(features);
    const neuralTAI = neuralOutput;
    const neuralXIU = 1 - neuralOutput;
    const neuralConf = 0.45;

    // ==========================================
    // 7. BAYESIAN UPDATE
    // ==========================================
    ensemble.bayesian.reset();
    const lastResult = history[history.length - 1];
    let streakLen = 1;
    for (let i = history.length - 2; i >= 0; i--) {
        if (history[i] === lastResult) streakLen++;
        else break;
    }
    const likelihoodTAI = lastResult === 'TAI' ?
        Math.max(0.1, 0.5 - streakLen * 0.03) :
        Math.min(0.9, 0.5 + streakLen * 0.03);
    const likelihoodXIU = 1 - likelihoodTAI;
    const bayesResult = ensemble.bayesian.update(likelihoodTAI, likelihoodXIU);
    const bayesTAI = bayesResult.TAI;
    const bayesXIU = bayesResult.XIU;
    const bayesConf = 0.5;

    // ==========================================
    // 8. CHAOS ANALYSIS
    // ==========================================
    const chaos = ChaosAnalysis.analyze(history.slice(-50));
    const chaosWeight = chaos.chaosLevel > 0.7 ? 0.5 : 1.0;

    // ==========================================
    // TỔNG HỢP VỚI TRỌNG SỐ ĐỘNG
    // ==========================================
    const baseWeights = {
        markov: 0.22,
        spectral: 0.10,
        pattern: 0.18,
        monteCarlo: 0.12,
        trend: 0.15,
        neural: 0.13,
        bayesian: 0.10
    };

    // Điều chỉnh theo chaos
    for (let key in baseWeights) {
        baseWeights[key] *= chaosWeight;
    }
    const totalW = Object.values(baseWeights).reduce((a, b) => a + b, 0);
    for (let key in baseWeights) {
        baseWeights[key] /= totalW;
    }

    // Trọng số cuối cùng = base * confidence
    const weightedTAI =
        markovTAI * baseWeights.markov * markovConf +
        spectralTAI * baseWeights.spectral * spectralConf +
        patternTAI * baseWeights.pattern * patternConf +
        mcTAI * baseWeights.monteCarlo * mcConf +
        trendTAI * baseWeights.trend * trendConf +
        neuralTAI * baseWeights.neural * neuralConf +
        bayesTAI * baseWeights.bayesian * bayesConf;

    const weightedXIU =
        markovXIU * baseWeights.markov * markovConf +
        spectralXIU * baseWeights.spectral * spectralConf +
        patternXIU * baseWeights.pattern * patternConf +
        mcXIU * baseWeights.monteCarlo * mcConf +
        trendXIU * baseWeights.trend * trendConf +
        neuralXIU * baseWeights.neural * neuralConf +
        bayesXIU * baseWeights.bayesian * bayesConf;

    const sumFinal = weightedTAI + weightedXIU;
    const finalTAI = weightedTAI / sumFinal;
    const finalXIU = weightedXIU / sumFinal;

    const prediction = finalTAI >= finalXIU ? 'TAI' : 'XIU';
    const confidence = Math.round(Math.max(finalTAI, finalXIU) * 10000) / 100;

    // Dự đoán điểm chi tiết
    const predictedPoint = Math.round(nextPoint * 100) / 100;

    // Dự đoán xúc xắc (tổng hợp từ phân phối)
    const allDice = dices.flat();
    const diceFreq = Array(7).fill(0);
    allDice.forEach(d => diceFreq[d]++);
    const diceProbs = diceFreq.map(f => f / allDice.length);
    const predictedDices = [];
    for (let i = 0; i < 3; i++) {
        let r = Math.random();
        let cum = 0;
        for (let d = 1; d <= 6; d++) {
            cum += diceProbs[d];
            if (r <= cum) {
                predictedDices.push(d);
                break;
            }
        }
    }

    // ==========================================
    // KẾT QUẢ
    // ==========================================
    const ket_qua = {
        id_phien_du_doan: nextId,
        du_doan: prediction,
        do_tin_cay: confidence,
        diem_du_kien: predictedPoint,
        xuc_xac_du_kien: predictedDices,
        ty_le: {
            TAI: Math.round(finalTAI * 10000) / 100,
            XIU: Math.round(finalXIU * 10000) / 100
        },
        chi_tiet_thuat_toan: {
            markov_bac_3: {
                du_doan: markovTAI >= markovXIU ? 'TAI' : 'XIU',
                ty_le: { TAI: Math.round(markovTAI * 100), XIU: Math.round(markovXIU * 100) },
                do_tin_cay: Math.round(markovConf * 100),
                trong_so: Math.round(baseWeights.markov * 100)
            },
            phan_tich_pho: {
                du_doan: spectralTAI >= spectralXIU ? 'TAI' : 'XIU',
                ty_le: { TAI: Math.round(spectralTAI * 100), XIU: Math.round(spectralXIU * 100) },
                chu_ky: spectral.dominantFreq,
                nang_luong: Math.round(spectral.power * 100),
                trong_so: Math.round(baseWeights.spectral * 100)
            },
            pattern_matching: {
                du_doan: patternTAI >= patternXIU ? 'TAI' : 'XIU',
                ty_le: { TAI: Math.round(patternTAI * 100), XIU: Math.round(patternXIU * 100) },
                so_mau_khop: patternResult?.matchCount || 0,
                trong_so: Math.round(baseWeights.pattern * 100)
            },
            monte_carlo: {
                du_doan: mcTAI >= mcXIU ? 'TAI' : 'XIU',
                ty_le: { TAI: Math.round(mcTAI * 100), XIU: Math.round(mcXIU * 100) },
                do_lech_chuan: Math.round(mc.sigma * 100),
                trong_so: Math.round(baseWeights.monteCarlo * 100)
            },
            xu_huong_diem: {
                du_doan: trendTAI >= trendXIU ? 'TAI' : 'XIU',
                ty_le: { TAI: Math.round(trendTAI * 100), XIU: Math.round(trendXIU * 100) },
                diem_du_doan: predictedPoint,
                trong_so: Math.round(baseWeights.trend * 100)
            },
            neural_network: {
                du_doan: neuralTAI >= neuralXIU ? 'TAI' : 'XIU',
                ty_le: { TAI: Math.round(neuralTAI * 100), XIU: Math.round(neuralXIU * 100) },
                trong_so: Math.round(baseWeights.neural * 100)
            },
            bayesian: {
                du_doan: bayesTAI >= bayesXIU ? 'TAI' : 'XIU',
                ty_le: { TAI: Math.round(bayesTAI * 100), XIU: Math.round(bayesXIU * 100) },
                trong_so: Math.round(baseWeights.bayesian * 100)
            },
            chaos_analysis: {
                entropy: Math.round(chaos.entropy * 100) / 100,
                muc_do_hoan_loan: chaos.interpretation,
                trong_so_dieu_chinh: Math.round(chaosWeight * 100)
            }
        },
        thong_ke_phien: {
            tong_phien: history.length,
            so_TAI: history.filter(h => h === 'TAI').length,
            so_XIU: history.filter(h => h === 'XIU').length,
            streak_hien_tai: streakLen,
            ket_qua_gan_nhat: lastResult
        },
        timestamp: new Date().toISOString()
    };

    return ket_qua;
}

// ============================================================
// CHẠY
// ============================================================
async function run() {
    try {
        const data = await fetchData();
        const result = du_doan_vip(data);

        console.log(JSON.stringify(result, null, 2));
        return result;

    } catch (err) {
        console.error('Loi:', err.message);
    }
}

run();

module.exports = { du_doan_vip, fetchData };
