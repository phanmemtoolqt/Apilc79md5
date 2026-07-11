
// ==========================================
// LC79 TXMD5 AI PREDICTOR V3.0
// 1000+ DÒNG THUẬT TOÁN DỰ ĐOÁN CHUYÊN SÂU
// ==========================================

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==========================================
// LỚP PHÂN TÍCH TOÁN HỌC
// ==========================================
class MathAnalysis {
  // Tính trung bình
  static mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // Tính median
  static median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Tính mode (giá trị xuất hiện nhiều nhất)
  static mode(arr) {
    const freq = {};
    arr.forEach(v => freq[v] = (freq[v] || 0) + 1);
    let maxCount = 0, mode = null;
    for (const [val, count] of Object.entries(freq)) {
      if (count > maxCount) { maxCount = count; mode = Number(val); }
    }
    return { value: mode, count: maxCount };
  }

  // Tính độ lệch chuẩn
  static standardDeviation(arr) {
    const avg = this.mean(arr);
    const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  // Hệ số biến thiên
  static coefficientOfVariation(arr) {
    const avg = this.mean(arr);
    const sd = this.standardDeviation(arr);
    return avg !== 0 ? (sd / avg) * 100 : 0;
  }

  // Tính xác suất
  static probability(favorable, total) {
    return total > 0 ? (favorable / total) * 100 : 0;
  }

  // Kiểm tra phân phối chuẩn
  static isNormalDistribution(arr) {
    const avg = this.mean(arr);
    const sd = this.standardDeviation(arr);
    let withinOneSD = 0;
    arr.forEach(v => {
      if (Math.abs(v - avg) <= sd) withinOneSD++;
    });
    const ratio = withinOneSD / arr.length;
    return ratio >= 0.65 && ratio <= 0.75;
  }

  // Tương quan Pearson giữa 2 mảng
  static pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    const xMean = this.mean(x.slice(0, n));
    const yMean = this.mean(y.slice(0, n));
    let num = 0, den1 = 0, den2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - xMean;
      const dy = y[i] - yMean;
      num += dx * dy;
      den1 += dx * dx;
      den2 += dy * dy;
    }
    const den = Math.sqrt(den1 * den2);
    return den !== 0 ? num / den : 0;
  }
}

// ==========================================
// LỚP PHÂN TÍCH CHUỖI PATTERN
// ==========================================
class PatternAnalyzer {
  constructor(history) {
    this.history = history;
  }

  // Trích xuất chuỗi T/X từ lịch sử
  extractSequence(length) {
    return this.history.slice(0, length).map(h => h.ket_qua).join('');
  }

  // Đếm số lần xuất hiện pattern trong chuỗi
  countPattern(sequence, pattern) {
    let count = 0;
    for (let i = 0; i <= sequence.length - pattern.length; i++) {
      if (sequence.substring(i, i + pattern.length) === pattern) count++;
    }
    return count;
  }

  // Tìm tất cả pattern lặp
  findAllPatterns(sequence, minLength = 2, maxLength = 6) {
    const patterns = [];
    for (let len = minLength; len <= maxLength; len++) {
      for (let i = 0; i <= sequence.length - len; i++) {
        const pattern = sequence.substring(i, i + len);
        const count = this.countPattern(sequence, pattern);
        if (count >= 2 && !patterns.find(p => p.pattern === pattern)) {
          patterns.push({
            pattern,
            length: len,
            count,
            positions: this.findPositions(sequence, pattern)
          });
        }
      }
    }
    return patterns.sort((a, b) => b.count * b.length - a.count * a.length);
  }

  // Tìm vị trí xuất hiện pattern
  findPositions(sequence, pattern) {
    const positions = [];
    for (let i = 0; i <= sequence.length - pattern.length; i++) {
      if (sequence.substring(i, i + pattern.length) === pattern) {
        positions.push(i);
      }
    }
    return positions;
  }

  // Kiểm tra pattern có đang active không
  isPatternActive(pattern) {
    const seq = this.extractSequence(20);
    return seq.startsWith(pattern);
  }

  // Dự đoán dựa trên pattern
  predictFromPattern(pattern) {
    if (!pattern || pattern.length < 2) return null;
    
    const seq = this.extractSequence(30);
    const lastChar = pattern[pattern.length - 1];
    
    // Nếu pattern kết thúc = T, dự đoán tiếp theo
    const nextChars = [];
    let pos = 0;
    while ((pos = seq.indexOf(pattern, pos)) !== -1) {
      if (pos + pattern.length < seq.length) {
        nextChars.push(seq[pos + pattern.length]);
      }
      pos++;
    }
    
    if (nextChars.length === 0) return lastChar === 'T' ? 'X' : 'T';
    
    const countT = nextChars.filter(c => c === 'T').length;
    const countX = nextChars.filter(c => c === 'X').length;
    
    return countT > countX ? 'T' : 'X';
  }
}

// ==========================================
// LỚP PHÂN TÍCH THỐNG KÊ NÂNG CAO
// ==========================================
class StatisticalAnalyzer {
  constructor(history) {
    this.history = history;
  }

  // Phân phối điểm số
  analyzePointDistribution(sampleSize = 50) {
    const samples = this.history.slice(0, sampleSize).map(h => h.point);
    const distribution = {};
    for (let i = 3; i <= 18; i++) {
      distribution[i] = samples.filter(p => p === i).length;
    }
    
    return {
      distribution,
      total: samples.length,
      highestFreq: MathAnalysis.mode(samples),
      mean: MathAnalysis.mean(samples),
      median: MathAnalysis.median(samples),
      stdDev: MathAnalysis.standardDeviation(samples)
    };
  }

  // Phân tích chu kỳ Tài/Xỉu
  analyzeCycles(windowSize = 10) {
    const cycles = [];
    const seq = this.history.slice(0, 100);
    
    for (let i = 0; i < seq.length - windowSize; i += windowSize) {
      const window = seq.slice(i, i + windowSize);
      const countT = window.filter(h => h.ket_qua === 'T').length;
      const countX = window.filter(h => h.ket_qua === 'X').length;
      cycles.push({
        startIndex: i,
        endIndex: i + windowSize - 1,
        taiRatio: countT / windowSize,
        xiuRatio: countX / windowSize,
        dominant: countT > countX ? 'T' : 'X'
      });
    }
    
    return cycles;
  }

  // Phân tích xu hướng dài hạn
  analyzeLongTermTrend() {
    const points = this.history.slice(0, 100).map(h => h.point);
    const movingAvg5 = [];
    const movingAvg10 = [];
    const movingAvg20 = [];
    
    for (let i = 4; i < points.length; i++) {
      movingAvg5.push(MathAnalysis.mean(points.slice(i - 4, i + 1)));
    }
    for (let i = 9; i < points.length; i++) {
      movingAvg10.push(MathAnalysis.mean(points.slice(i - 9, i + 1)));
    }
    for (let i = 19; i < points.length; i++) {
      movingAvg20.push(MathAnalysis.mean(points.slice(i - 19, i + 1)));
    }
    
    const trend5 = movingAvg5.length >= 2 ? 
      movingAvg5[movingAvg5.length - 1] - movingAvg5[movingAvg5.length - 2] : 0;
    const trend10 = movingAvg10.length >= 2 ? 
      movingAvg10[movingAvg10.length - 1] - movingAvg10[movingAvg10.length - 2] : 0;
    const trend20 = movingAvg20.length >= 2 ? 
      movingAvg20[movingAvg20.length - 1] - movingAvg20[movingAvg20.length - 2] : 0;
    
    return {
      ma5: movingAvg5.slice(-5),
      ma10: movingAvg10.slice(-5),
      ma20: movingAvg20.slice(-5),
      trend: {
        shortTerm: trend5 > 0 ? 'UP' : trend5 < 0 ? 'DOWN' : 'STABLE',
        midTerm: trend10 > 0 ? 'UP' : trend10 < 0 ? 'DOWN' : 'STABLE',
        longTerm: trend20 > 0 ? 'UP' : trend20 < 0 ? 'DOWN' : 'STABLE'
      },
      signal: trend5 + trend10 + trend20 > 0 ? 'T' : 'X'
    };
  }

  // Phân tích momentum
  analyzeMomentum() {
    const points = this.history.slice(0, 20).map(h => h.point);
    const changes = [];
    for (let i = 0; i < points.length - 1; i++) {
      changes.push(points[i] - points[i + 1]);
    }
    
    const positiveChanges = changes.filter(c => c > 0).length;
    const negativeChanges = changes.filter(c => c < 0).length;
    const avgChange = MathAnalysis.mean(changes.map(Math.abs));
    
    return {
      momentum: positiveChanges > negativeChanges ? 'XUỐNG' : positiveChanges < negativeChanges ? 'LÊN' : 'NGANG',
      strength: avgChange,
      positiveRatio: positiveChanges / changes.length,
      negativeRatio: negativeChanges / changes.length,
      signal: positiveChanges > negativeChanges ? 'X' : 'T'
    };
  }

  // Phân tích biến động
  analyzeVolatility() {
    const points = this.history.slice(0, 30).map(h => h.point);
    const cv = MathAnalysis.coefficientOfVariation(points);
    const isNormal = MathAnalysis.isNormalDistribution(points);
    
    return {
      coefficientOfVariation: cv,
      isNormalDistribution: isNormal,
      volatility: cv > 25 ? 'CAO' : cv > 15 ? 'TRUNG BÌNH' : 'THẤP',
      signal: cv > 25 ? (MathAnalysis.mean(points) > 10.5 ? 'X' : 'T') : null
    };
  }

  // Phân tích tương quan xúc xắc
  analyzeDiceCorrelation() {
    if (this.history.length < 10) return null;
    
    const dice1 = this.history.slice(0, 20).map(h => h.dices[0]);
    const dice2 = this.history.slice(0, 20).map(h => h.dices[1]);
    const dice3 = this.history.slice(0, 20).map(h => h.dices[2]);
    
    const corr12 = MathAnalysis.pearsonCorrelation(dice1, dice2);
    const corr13 = MathAnalysis.pearsonCorrelation(dice1, dice3);
    const corr23 = MathAnalysis.pearsonCorrelation(dice2, dice3);
    
    return {
      dice1_2: corr12,
      dice1_3: corr13,
      dice2_3: corr23,
      avgCorrelation: (corr12 + corr13 + corr23) / 3,
      signal: Math.abs(corr12 + corr13 + corr23) / 3 > 0.3 ? 
        (MathAnalysis.mean([...dice1, ...dice2, ...dice3]) > 3.5 ? 'T' : 'X') : null
    };
  }
}

// ==========================================
// LỚP PHÂN TÍCH CHUỖI THỜI GIAN
// ==========================================
class TimeSeriesAnalyzer {
  constructor(history) {
    this.history = history;
  }

  // Phân tích mùa vụ (seasonality)
  analyzeSeasonality(period = 10) {
    const points = this.history.slice(0, 50).map(h => h.point);
    const seasonalPattern = [];
    
    for (let i = 0; i < period && i < points.length; i++) {
      let sum = 0, count = 0;
      for (let j = i; j < points.length; j += period) {
        sum += points[j];
        count++;
      }
      seasonalPattern.push(sum / count);
    }
    
    const avg = MathAnalysis.mean(seasonalPattern);
    return {
      pattern: seasonalPattern,
      anomalies: seasonalPattern.map((v, i) => ({
        position: i,
        value: v,
        deviation: v - avg,
        isAnomaly: Math.abs(v - avg) > MathAnalysis.standardDeviation(seasonalPattern)
      })),
      signal: seasonalPattern[0] > avg ? 'T' : 'X'
    };
  }

  // Dự đoán theo ARIMA đơn giản
  arimaPredict(lag = 5) {
    const points = this.history.slice(0, 30).map(h => h.point);
    const diffs = [];
    for (let i = 0; i < points.length - 1; i++) {
      diffs.push(points[i] - points[i + 1]);
    }
    
    // Auto-Regressive
    const arCoeffs = [];
    for (let l = 1; l <= lag; l++) {
      let num = 0, den = 0;
      for (let i = l; i < points.length; i++) {
        num += (points[i] - MathAnalysis.mean(points)) * 
               (points[i - l] - MathAnalysis.mean(points));
        den += Math.pow(points[i - l] - MathAnalysis.mean(points), 2);
      }
      arCoeffs.push(den !== 0 ? num / den : 0);
    }
    
    // Dự đoán 1 bước
    let prediction = 0;
    for (let l = 0; l < lag; l++) {
      prediction += arCoeffs[l] * points[l];
    }
    prediction += MathAnalysis.mean(diffs);
    
    return {
      prediction: Math.max(3, Math.min(18, Math.round(prediction))),
      confidence: Math.abs(arCoeffs.reduce((a, b) => a + b, 0) / lag),
      signal: prediction > 10.5 ? 'T' : 'X'
    };
  }

  // Phân tích breakpoint (điểm gãy cấu trúc)
  detectBreakpoints() {
    const points = this.history.slice(0, 30).map(h => h.point);
    const breakpoints = [];
    const windowSize = 5;
    
    for (let i = windowSize; i < points.length - windowSize; i++) {
      const before = MathAnalysis.mean(points.slice(i - windowSize, i));
      const after = MathAnalysis.mean(points.slice(i, i + windowSize));
      const change = Math.abs(after - before);
      
      if (change > MathAnalysis.standardDeviation(points)) {
        breakpoints.push({
          position: i,
          beforeMean: before,
          afterMean: after,
          change: change,
          direction: after > before ? 'TĂNG' : 'GIẢM'
        });
      }
    }
    
    return {
      breakpoints,
      count: breakpoints.length,
      lastBreakpoint: breakpoints[breakpoints.length - 1] || null,
      signal: breakpoints.length > 0 ? 
        (breakpoints[breakpoints.length - 1].afterMean > 10.5 ? 'T' : 'X') : null
    };
  }

  // Exponential Smoothing
  exponentialSmoothing(alpha = 0.3) {
    const points = this.history.slice(0, 20).map(h => h.point).reverse();
    let smoothed = points[0];
    const smoothedValues = [smoothed];
    
    for (let i = 1; i < points.length; i++) {
      smoothed = alpha * points[i] + (1 - alpha) * smoothed;
      smoothedValues.push(smoothed);
    }
    
    const forecast = alpha * points[points.length - 1] + (1 - alpha) * smoothed;
    
    return {
      smoothedValues: smoothedValues.reverse(),
      forecast: Math.round(forecast),
      trend: smoothedValues[smoothedValues.length - 1] > smoothedValues[0] ? 'UP' : 'DOWN',
      signal: forecast > 10.5 ? 'T' : 'X'
    };
  }
}

// ==========================================
// LỚP PHÂN TÍCH MARKOV CHAIN
// ==========================================
class MarkovAnalyzer {
  constructor(history) {
    this.history = history;
  }

  // Xây dựng ma trận chuyển đổi
  buildTransitionMatrix(order = 1) {
    const seq = this.history.slice(0, 100).map(h => h.ket_qua);
    const states = order === 1 ? ['T', 'X'] : this.getAllStates(order, seq);
    const matrix = {};
    
    for (const state of states) {
      matrix[state] = {};
      let totalTransitions = 0;
      
      for (const nextState of ['T', 'X']) {
        let count = 0;
        for (let i = 0; i < seq.length - order; i++) {
          const currentState = seq.slice(i, i + order).join('');
          if (currentState === state && seq[i + order] === nextState) {
            count++;
          }
        }
        matrix[state][nextState] = count;
        totalTransitions += count;
      }
      
      // Tính xác suất
      if (totalTransitions > 0) {
        for (const nextState of ['T', 'X']) {
          matrix[state][nextState] = matrix[state][nextState] / totalTransitions;
        }
      }
    }
    
    return matrix;
  }

  // Lấy tất cả trạng thái
  getAllStates(order, seq) {
    const states = new Set();
    for (let i = 0; i <= seq.length - order; i++) {
      states.add(seq.slice(i, i + order).join(''));
    }
    return Array.from(states);
  }

  // Dự đoán bước tiếp theo
  predictNext(order = 2) {
    const matrix = this.buildTransitionMatrix(order);
    const seq = this.history.slice(0, 100).map(h => h.ket_qua);
    const currentState = seq.slice(0, order).join('');
    
    if (!matrix[currentState]) return null;
    
    const probT = matrix[currentState]['T'] || 0;
    const probX = matrix[currentState]['X'] || 0;
    
    return {
      currentState,
      probabilityT: probT,
      probabilityX: probX,
      prediction: probT > probX ? 'T' : 'X',
      confidence: Math.abs(probT - probX)
    };
  }

  // Mô phỏng Monte Carlo
  monteCarloSimulation(steps = 10, simulations = 100) {
    const seq = this.history.slice(0, 50).map(h => h.ket_qua);
    const results = { 'T': 0, 'X': 0 };
    
    for (let s = 0; s < simulations; s++) {
      let currentState = seq.slice(0, 3).join('');
      for (let step = 0; step < steps; step++) {
        const probT = this.estimateProbability(currentState, 'T', seq);
        const next = Math.random() < probT ? 'T' : 'X';
        currentState = (currentState + next).slice(-3);
        if (step === steps - 1) results[next]++;
      }
    }
    
    return {
      results,
      probabilityT: results['T'] / simulations,
      probabilityX: results['X'] / simulations,
      prediction: results['T'] > results['X'] ? 'T' : 'X'
    };
  }

  estimateProbability(state, next, seq) {
    let count = 0, total = 0;
    for (let i = 0; i < seq.length - state.length; i++) {
      if (seq.slice(i, i + state.length).join('') === state) {
        total++;
        if (seq[i + state.length] === next) count++;
      }
    }
    return total > 0 ? count / total : 0.5;
  }
}

// ==========================================
// LỚP PHÂN TÍCH KẾT HỢP (ENSEMBLE)
// ==========================================
class EnsembleAnalyzer {
  constructor(history) {
    this.history = history;
    this.patternAnalyzer = new PatternAnalyzer(history);
    this.statisticalAnalyzer = new StatisticalAnalyzer(history);
    this.timeSeriesAnalyzer = new TimeSeriesAnalyzer(history);
    this.markovAnalyzer = new MarkovAnalyzer(history);
  }

  // Kết hợp tất cả dự đoán
  combinePredictions() {
    const predictions = [];
    
    // 1. Pattern matching
    const seq = this.patternAnalyzer.extractSequence(15);
    const patterns = this.patternAnalyzer.findAllPatterns(seq, 2, 4);
    if (patterns.length > 0) {
      const pred = this.patternAnalyzer.predictFromPattern(patterns[0].pattern);
      if (pred) {
        predictions.push({ method: 'PATTERN_MATCHING', prediction: pred, weight: 0.25 });
      }
    }
    
    // 2. Phân tích xu hướng
    const trend = this.statisticalAnalyzer.analyzeLongTermTrend();
    if (trend.signal) {
      predictions.push({ method: 'TREND_ANALYSIS', prediction: trend.signal, weight: 0.15 });
    }
    
    // 3. Phân tích momentum
    const momentum = this.statisticalAnalyzer.analyzeMomentum();
    if (momentum.signal) {
      predictions.push({ method: 'MOMENTUM', prediction: momentum.signal, weight: 0.10 });
    }
    
    // 4. Phân tích biến động
    const volatility = this.statisticalAnalyzer.analyzeVolatility();
    if (volatility.signal) {
      predictions.push({ method: 'VOLATILITY', prediction: volatility.signal, weight: 0.10 });
    }
    
    // 5. Phân tích mùa vụ
    const seasonality = this.timeSeriesAnalyzer.analyzeSeasonality();
    if (seasonality.signal) {
      predictions.push({ method: 'SEASONALITY', prediction: seasonality.signal, weight: 0.10 });
    }
    
    // 6. ARIMA
    const arima = this.timeSeriesAnalyzer.arimaPredict();
    if (arima.signal) {
      predictions.push({ method: 'ARIMA', prediction: arima.signal, weight: 0.10 });
    }
    
    // 7. Exponential Smoothing
    const exp = this.timeSeriesAnalyzer.exponentialSmoothing();
    if (exp.signal) {
      predictions.push({ method: 'EXP_SMOOTHING', prediction: exp.signal, weight: 0.05 });
    }
    
    // 8. Markov Chain
    const markov = this.markovAnalyzer.predictNext(2);
    if (markov && markov.prediction) {
      predictions.push({ method: 'MARKOV', prediction: markov.prediction, weight: 0.10 });
    }
    
    // 9. Monte Carlo
    const monteCarlo = this.markovAnalyzer.monteCarloSimulation(5, 50);
    if (monteCarlo.prediction) {
      predictions.push({ method: 'MONTE_CARLO', prediction: monteCarlo.prediction, weight: 0.05 });
    }
    
    // Tính điểm tổng hợp
    let scoreT = 0, scoreX = 0;
    predictions.forEach(p => {
      if (p.prediction === 'T') scoreT += p.weight;
      else scoreX += p.weight;
    });
    
    const totalWeight = scoreT + scoreX;
    const finalPrediction = scoreT > scoreX ? 'T' : 'X';
    const confidence = totalWeight > 0 ? 
      Math.round((Math.max(scoreT, scoreX) / totalWeight) * 100) : 50;
    
    return {
      predictions,
      finalPrediction,
      confidence,
      scoreT: Math.round(scoreT * 100),
      scoreX: Math.round(scoreX * 100)
    };
  }
}

// ==========================================
// LỚP CHÍNH LC79 AI
// ==========================================
class LC79AI {
  constructor() {
    this.history = [];
  }

  async fetchData() {
    try {
      const res = await axios.get('https://wtxmd52.tele68.com/v1/txmd5/sessions', { 
        timeout: 10000 
      });
      const raw = res.data;
      
      if (raw && raw.list && Array.isArray(raw.list)) {
        this.history = raw.list.map(item => ({
          id: item.id,
          point: item.point,
          dices: item.dices,
          ket_qua: item.resultTruyenThong === 'TAI' ? 'T' : 'X'
        }));
        return true;
      }
      return false;
    } catch (e) {
      console.error('Lỗi fetch:', e.message);
      return false;
    }
  }

  // Phân tích cầu đơn giản (fallback)
  simpleAnalyze() {
    const h = this.history;
    const last = h[0];
    const nextId = last.id + 1;
    const chuoi15 = h.slice(0, 15).map(i => i.ket_qua).join('');
    
    let countT = 0, countX = 0;
    for (let c of chuoi15) {
      c === 'T' ? countT++ : countX++;
    }

    let cau = '', duDoan = '', reason = '';
    const last6 = chuoi15.substring(0, 6);

    if (last6 === 'TTTTTT') {
      duDoan = 'X'; cau = 'BỆT TÀI DÀI';
      reason = 'Bệt Tài 6 phiên -> Gãy sang Xỉu';
    } else if (last6 === 'XXXXXX') {
      duDoan = 'T'; cau = 'BỆT XỈU DÀI';
      reason = 'Bệt Xỉu 6 phiên -> Gãy sang Tài';
    } else if (chuoi15.substring(0, 8).match(/^(TX){4}/)) {
      duDoan = last6[0] === 'T' ? 'X' : 'T';
      cau = 'CẦU 1-1'; reason = 'Xen kẽ đều -> Tiếp tục';
    } else if (chuoi15.substring(0, 6) === 'TTXTTX') {
      duDoan = 'T'; cau = 'CẦU 2-1';
      reason = '2-1 đều -> Tiếp tục T';
    } else if (chuoi15.substring(0, 6) === 'XXTXXT') {
      duDoan = 'X'; cau = 'CẦU 2-1';
      reason = '2-1 đều -> Tiếp tục X';
    } else if (last6[0] !== last6[1] && last6[1] === last6[2] && last6[2] === last6[3]) {
      duDoan = last6[1] === 'T' ? 'X' : 'T';
      cau = 'GÃY CẦU'; reason = `Gãy từ ${last6[1]} -> Đảo chiều`;
    } else if (countT > countX + 4) {
      duDoan = 'X'; cau = 'LỆCH TÀI';
      reason = `T:${countT} X:${countX} -> Về Xỉu`;
    } else if (countX > countT + 4) {
      duDoan = 'T'; cau = 'LỆCH XỈU';
      reason = `T:${countT} X:${countX} -> Về Tài`;
    } else {
      duDoan = last.ket_qua === 'T' ? 'X' : 'T';
      cau = 'XEN KẼ'; reason = 'Không rõ cầu -> Đánh đảo';
    }

    return {
      phien_hien_tai: {
        id: last.id,
        ket_qua: last.ket_qua === 'T' ? 'Tài' : 'Xỉu',
        diem: last.point,
        xuc_xac: last.dices
      },
      phien_du_doan: {
        id: nextId,
        du_doan: duDoan === 'T' ? 'Tài' : 'Xỉu',
        loai_cau: cau,
        ly_do: reason,
        chuoi_15_phien: chuoi15
      },
      thong_ke: {
        tai: countT,
        xiu: countX,
        chenh_lech: Math.abs(countT - countX)
      }
    };
  }

  // Phân tích nâng cao với Ensemble
  advancedAnalyze() {
    const last = this.history[0];
    const nextId = last.id + 1;
    
    const ensemble = new EnsembleAnalyzer(this.history);
    const result = ensemble.combinePredictions();
    const chuoi15 = this.history.slice(0, 15).map(i => i.ket_qua).join('');
    
    return {
      phien_hien_tai: {
        id: last.id,
        ket_qua: last.ket_qua === 'T' ? 'Tài' : 'Xỉu',
        diem: last.point,
        xuc_xac: last.dices,
        thoi_gian: new Date().toISOString()
      },
      phien_du_doan: {
        id: nextId,
        du_doan: result.finalPrediction === 'T' ? 'Tài' : 'Xỉu',
        do_tin_cay: result.confidence + '%',
        diem_tai: result.scoreT,
        diem_xiu: result.scoreX,
        so_model: result.predictions.length
      },
      phan_tich_chuyen_sau: {
        chuoi_15_phien: chuoi15,
        cac_model: result.predictions.map(p => ({
          model: p.method,
          du_doan: p.prediction === 'T' ? 'Tài' : 'Xỉu',
          trong_so: Math.round(p.weight * 100) + '%'
        })),
        diem_trung_binh: MathAnalysis.mean(this.history.slice(0, 20).map(h => h.point)).toFixed(1),
        do_lech_chuan: MathAnalysis.standardDeviation(this.history.slice(0, 20).map(h => h.point)).toFixed(2)
      },
      khuyen_nghi: result.confidence >= 75 
        ? `✅ NÊN ĐÁNH ${result.finalPrediction === 'T' ? 'TÀI' : 'XỈU'} - ĐỘ TIN CẬY CAO`
        : result.confidence >= 60
          ? `⚠️ CÂN NHẮC ${result.finalPrediction === 'T' ? 'TÀI' : 'XỈU'} - ĐỘ TIN CẬY TRUNG BÌNH`
          : `❌ RỦI RO CAO - HẠN CHẾ ĐÁNH`
    };
  }
}

// ==========================================
// KHỞI TẠO VÀ ROUTES
// ==========================================
const ai = new LC79AI();

// Cache dữ liệu
let lastFetch = 0;
const CACHE_DURATION = 3000; // 3 giây

app.get('/vanhoa', async (req, res) => {
  try {
    // Kiểm tra cache
    const now = Date.now();
    if (now - lastFetch < CACHE_DURATION && ai.history.length >= 15) {
      const result = ai.advancedAnalyze();
      return res.json({
        status: 'success',
        cached: true,
        ...result
      });
    }
    
    const ok = await ai.fetchData();
    lastFetch = now;
    
    if (!ok || ai.history.length < 15) {
      return res.json({
        status: 'error',
        message: `Cần ít nhất 15 phiên (hiện có: ${ai.history.length})`,
        data: null
      });
    }
    
    const result = ai.advancedAnalyze();
    res.json({
      status: 'success',
      cached: false,
      ...result
    });
    
  } catch (e) {
    res.status(500).json({
      status: 'error',
      message: 'Lỗi server: ' + e.message
    });
  }
});

// Endpoint phân tích chi tiết
app.get('/phan-tich', async (req, res) => {
  try {
    if (ai.history.length < 15) {
      await ai.fetchData();
    }
    
    if (ai.history.length < 15) {
      return res.json({ status: 'error', message: 'Không đủ dữ liệu' });
    }
    
    const statAnalyzer = new StatisticalAnalyzer(ai.history);
    const timeSeriesAnalyzer = new TimeSeriesAnalyzer(ai.history);
    const markovAnalyzer = new MarkovAnalyzer(ai.history);
    
    res.json({
      status: 'success',
      phan_phoi_diem: statAnalyzer.analyzePointDistribution(30),
      xu_huong_dai_han: statAnalyzer.analyzeLongTermTrend(),
      momentum: statAnalyzer.analyzeMomentum(),
      bien_dong: statAnalyzer.analyzeVolatility(),
      tuong_quan_xuc_xac: statAnalyzer.analyzeDiceCorrelation(),
      mua_vu: timeSeriesAnalyzer.analyzeSeasonality(),
      arima: timeSeriesAnalyzer.arimaPredict(),
      breakpoints: timeSeriesAnalyzer.detectBreakpoints(),
      markov: markovAnalyzer.predictNext(2),
      monte_carlo: markovAnalyzer.monteCarloSimulation(5, 100)
    });
    
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'LC79 TXMD5',
    so_phien: ai.history.length,
    phien_moi_nhat: ai.history.length > 0 ? ai.history[0].id : null,
    timestamp: new Date().toISOString()
  });
});

// Trang chủ
app.get('/', (req, res) => {
  res.json({
    game: 'LC79 TXMD5 AI Predictor V3.0',
    version: '3.0.0',
    endpoints: {
      du_doan: '/vanhoa',
      phan_tich_chi_tiet: '/phan-tich',
      health: '/health'
    },
    thuat_toan: [
      'Pattern Matching & Recognition',
      'Statistical Analysis (Mean, Median, Mode, SD)',
      'Moving Averages (MA5, MA10, MA20)',
      'Momentum Analysis',
      'Volatility Analysis',
      'Seasonality Detection',
      'ARIMA Simple Prediction',
      'Exponential Smoothing',
      'Markov Chain (Order 1-3)',
      'Monte Carlo Simulation',
      'Breakpoint Detection',
      'Dice Correlation',
      'Ensemble Learning',
      'Long-term Trend Analysis',
      'Point Distribution Analysis'
    ],
    so_dong_code: '1000+',
    mo_ta: 'Hệ thống AI dự đoán Tài Xỉu với 15+ thuật toán phân tích chuyên sâu'
  });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     LC79 TXMD5 AI PREDICTOR V3.0      ║');
  console.log('║     1000+ DÒNG THUẬT TOÁN AI         ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  Server: http://localhost:${PORT}         ║`);
  console.log(`║  API: http://localhost:${PORT}/vanhoa    ║`);
  console.log('╚════════════════════════════════════════╝');
});
