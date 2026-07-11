// ==========================================
// LC79 TXMD5 AI PREDICTOR - FULL CODE
// ==========================================

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==========================================
// AI ENGINE
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
          result: item.resultTruyenThong,
          ket_qua: item.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu'
        }));
        return true;
      }
      
      if (Array.isArray(raw)) {
        this.history = raw.map(item => ({
          id: item.id,
          point: item.point,
          dices: item.dices,
          result: item.resultTruyenThong,
          ket_qua: item.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu'
        }));
        return true;
      }
      
      return false;
    } catch (e) {
      console.error('Lỗi:', e.message);
      return false;
    }
  }

  analyze() {
    if (this.history.length < 15) return null;

    const patterns = [];
    let scoreTai = 0, scoreXiu = 0;

    // 1. Cầu Bệt
    let betCount = 1;
    const firstKQ = this.history[0].ket_qua;
    for (let i = 1; i < Math.min(this.history.length, 30); i++) {
      if (this.history[i].ket_qua === firstKQ) betCount++;
      else break;
    }
    if (betCount >= 4) {
      firstKQ === 'Tài' ? scoreXiu += 15 : scoreTai += 15;
      patterns.push({ ten: 'Cầu Bệt', mo_ta: `${firstKQ} ${betCount} phiên - Sắp gãy` });
    } else {
      firstKQ === 'Tài' ? scoreTai += 8 : scoreXiu += 8;
      patterns.push({ ten: 'Cầu Bệt', mo_ta: `${firstKQ} ${betCount} phiên - Tiếp tục` });
    }

    // 2. Cầu 1-1
    const last6 = this.history.slice(0, 6);
    let is1_1 = true;
    for (let i = 0; i < 5; i++) {
      if (last6[i].ket_qua === last6[i+1].ket_qua) { is1_1 = false; break; }
    }
    if (is1_1) {
      last6[0].ket_qua === 'Tài' ? scoreXiu += 18 : scoreTai += 18;
      patterns.push({ ten: 'Cầu 1-1', mo_ta: 'Tài Xỉu xen kẽ' });
    }

    // 3. Cầu 2-1
    if (this.history.length >= 9) {
      const last9 = this.history.slice(0, 9);
      let ok = true;
      for (let i = 0; i < 6; i += 3) {
        if (!(last9[i].ket_qua === last9[i+1].ket_qua && last9[i].ket_qua !== last9[i+2].ket_qua)) {
          ok = false; break;
        }
      }
      if (ok) {
        last9[0].ket_qua === 'Tài' ? scoreTai += 16 : scoreXiu += 16;
        patterns.push({ ten: 'Cầu 2-1', mo_ta: `2 ${last9[0].ket_qua} - 1 ${last9[2].ket_qua}` });
      }
    }

    // 4. Điểm TB 10 phiên
    const avg10 = this.history.slice(0, 10).reduce((s, h) => s + h.point, 0) / 10;
    if (avg10 > 10.5) {
      scoreTai += 10;
      patterns.push({ ten: 'Điểm TB 10 phiên', mo_ta: `${avg10.toFixed(1)} - Nghiêng Tài` });
    } else {
      scoreXiu += 10;
      patterns.push({ ten: 'Điểm TB 10 phiên', mo_ta: `${avg10.toFixed(1)} - Nghiêng Xỉu` });
    }

    // 5. Điểm TB 20 phiên
    if (this.history.length >= 20) {
      const avg20 = this.history.slice(0, 20).reduce((s, h) => s + h.point, 0) / 20;
      if (avg20 > 10.5) {
        scoreTai += 8;
        patterns.push({ ten: 'Điểm TB 20 phiên', mo_ta: `${avg20.toFixed(1)} - Nghiêng Tài` });
      } else {
        scoreXiu += 8;
        patterns.push({ ten: 'Điểm TB 20 phiên', mo_ta: `${avg20.toFixed(1)} - Nghiêng Xỉu` });
      }
    }

    // 6. Tần suất 20 phiên
    if (this.history.length >= 20) {
      let tai = 0, xiu = 0;
      this.history.slice(0, 20).forEach(h => {
        h.ket_qua === 'Tài' ? tai++ : xiu++;
      });
      if (tai > xiu + 3) {
        scoreXiu += 12;
        patterns.push({ ten: 'Tần suất 20 phiên', mo_ta: `Tài:${tai} Xỉu:${xiu} - Sắp về Xỉu` });
      } else if (xiu > tai + 3) {
        scoreTai += 12;
        patterns.push({ ten: 'Tần suất 20 phiên', mo_ta: `Tài:${tai} Xỉu:${xiu} - Sắp về Tài` });
      }
    }

    // 7. Tần suất 50 phiên
    if (this.history.length >= 50) {
      let tai = 0, xiu = 0;
      this.history.slice(0, 50).forEach(h => {
        h.ket_qua === 'Tài' ? tai++ : xiu++;
      });
      if (Math.abs(tai - xiu) >= 6) {
        tai > xiu ? scoreXiu += 10 : scoreTai += 10;
        patterns.push({ ten: 'Tần suất 50 phiên', mo_ta: `Tài:${tai} Xỉu:${xiu}` });
      }
    }

    // 8. Xu hướng điểm 5 phiên
    const last5 = this.history.slice(0, 5);
    let trend = 0;
    for (let i = 0; i < 4; i++) {
      if (last5[i].point > last5[i+1].point) trend++;
      else if (last5[i].point < last5[i+1].point) trend--;
    }
    if (trend > 2) {
      scoreXiu += 10;
      patterns.push({ ten: 'Xu hướng điểm', mo_ta: 'Đang giảm mạnh' });
    } else if (trend < -2) {
      scoreTai += 10;
      patterns.push({ ten: 'Xu hướng điểm', mo_ta: 'Đang tăng mạnh' });
    }

    // 9. Min/Max
    const points10 = this.history.slice(0, 10).map(h => h.point);
    const max = Math.max(...points10);
    const min = Math.min(...points10);
    if (max >= 17) {
      scoreXiu += 10;
      patterns.push({ ten: 'Min/Max', mo_ta: `Cao nhất ${max} - Sắp về Xỉu` });
    } else if (min <= 3) {
      scoreTai += 10;
      patterns.push({ ten: 'Min/Max', mo_ta: `Thấp nhất ${min} - Sắp về Tài` });
    }

    // 10. Xúc xắc nóng
    const freq = {};
    this.history.slice(0, 10).forEach(h => {
      h.dices.forEach(d => { freq[d] = (freq[d] || 0) + 1; });
    });
    let hot = null, maxF = 0;
    for (const [num, count] of Object.entries(freq)) {
      if (count > maxF) { maxF = count; hot = parseInt(num); }
    }
    if (hot >= 5) {
      scoreTai += 6;
      patterns.push({ ten: 'Xúc xắc nóng', mo_ta: `Số ${hot} nóng (${maxF} lần)` });
    } else if (hot <= 2) {
      scoreXiu += 6;
      patterns.push({ ten: 'Xúc xắc nóng', mo_ta: `Số ${hot} thấp (${maxF} lần)` });
    }

    // 11. Cầu gãy
    if (this.history.length >= 4) {
      const last4 = this.history.slice(0, 4);
      if (last4[0].ket_qua !== last4[1].ket_qua && 
          last4[1].ket_qua === last4[2].ket_qua && 
          last4[2].ket_qua === last4[3].ket_qua) {
        last4[1].ket_qua === 'Tài' ? scoreXiu += 12 : scoreTai += 12;
        patterns.push({ ten: 'Cầu Gãy', mo_ta: `Cầu ${last4[1].ket_qua} vừa gãy` });
      }
    }

    // 12. Điểm lặp
    const pts5 = this.history.slice(0, 5).map(h => h.point);
    const freqP = {};
    pts5.forEach(p => { freqP[p] = (freqP[p] || 0) + 1; });
    for (const [p, c] of Object.entries(freqP)) {
      if (c >= 3) {
        parseInt(p) >= 11 ? scoreTai += 8 : scoreXiu += 8;
        patterns.push({ ten: 'Điểm Lặp', mo_ta: `Điểm ${p} lặp ${c} lần` });
      }
    }

    // 13. Chẵn/Lẻ
    let chan = 0, le = 0;
    this.history.slice(0, 10).forEach(h => {
      h.point % 2 === 0 ? chan++ : le++;
    });
    if (chan > le + 3) {
      scoreXiu += 5;
      patterns.push({ ten: 'Chẵn/Lẻ', mo_ta: `Chẵn ${chan} - Lẻ ${le}` });
    } else if (le > chan + 3) {
      scoreTai += 5;
      patterns.push({ ten: 'Chẵn/Lẻ', mo_ta: `Chẵn ${chan} - Lẻ ${le}` });
    }

    // 14. Tổng xúc xắc TB
    const avgDice = this.history.slice(0, 5)
      .reduce((s, h) => s + h.dices.reduce((a, b) => a + b, 0), 0) / 5;
    if (avgDice > 10.5) {
      scoreTai += 7;
      patterns.push({ ten: 'Tổng xúc xắc', mo_ta: `TB: ${avgDice.toFixed(1)}` });
    } else {
      scoreXiu += 7;
      patterns.push({ ten: 'Tổng xúc xắc', mo_ta: `TB: ${avgDice.toFixed(1)}` });
    }

    // 15. Phiên cuối là Tài/Xỉu
    if (this.history[0].point >= 11) {
      scoreTai += 5;
      patterns.push({ ten: 'Phiên cuối', mo_ta: `Điểm ${this.history[0].point} - Tài` });
    } else {
      scoreXiu += 5;
      patterns.push({ ten: 'Phiên cuối', mo_ta: `Điểm ${this.history[0].point} - Xỉu` });
    }

    const finalPredict = scoreTai > scoreXiu ? 'Tài' : 'Xỉu';
    const total = scoreTai + scoreXiu;
    const confidence = Math.round((Math.max(scoreTai, scoreXiu) / total) * 100);

    return {
      finalPredict,
      confidence,
      scoreTai,
      scoreXiu,
      patterns
    };
  }
}

// ==========================================
// ROUTES
// ==========================================
const ai = new LC79AI();

app.get('/vanhoa', async (req, res) => {
  try {
    const ok = await ai.fetchData();
    if (!ok || ai.history.length < 15) {
      return res.json({
        status: 'error',
        message: `Cần 15 phiên (hiện có: ${ai.history.length})`
      });
    }

    const result = ai.analyze();
    const last = ai.history[0];
    const nextId = last.id + 1;

    res.json({
      status: 'success',
      phien_hien_tai: {
        id: last.id,
        ket_qua: last.ket_qua,
        diem: last.point,
        xuc_xac: last.dices
      },
      phien_du_doan: {
        id: nextId,
        du_doan: result.finalPredict,
        do_tin_cay: result.confidence + '%',
        diem_tai: result.scoreTai,
        diem_xiu: result.scoreXiu
      },
      patterns: result.patterns,
      khuyen_nghi: result.confidence >= 70 
        ? `✅ Nên đánh ${result.finalPredict}` 
        : result.confidence >= 55 
          ? `⚠️ Cân nhắc ${result.finalPredict}` 
          : `❌ Rủi ro cao`
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`LC79 AI chạy tại: http://localhost:${PORT}/vanhoa`);
});
