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
    this.patterns = [];
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
      
      // Fallback: thử parse trực tiếp nếu là array
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
      console.error('Lỗi kết nối:', e.message);
      return false;
    }
  }

  // ========== 15 PATTERNS ==========

  // 1. Cầu Bệt
  cauBet() {
    if (this.history.length < 3) return null;
    let count = 1;
    const first = this.history[0].ket_qua;
    for (let i = 1; i < Math.min(this.history.length, 30); i++) {
      if (this.history[i].ket_qua === first) count++;
      else break;
    }
    return {
      ten: 'Cầu Bệt',
      mo_ta: `${first} liên tiếp ${count} phiên`,
      so_phien: count,
      du_doan: count >= 5 ? (first === 'Tài' ? 'Xỉu' : 'Tài') : first,
      trong_so: count >= 6 ? 20 : count >= 4 ? 15 : count >= 2 ? 8 : 5
    };
  }

  // 2. Cầu 1-1
  cau1_1() {
    if (this.history.length < 6) return null;
    const last6 = this.history.slice(0, 6);
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if (last6[i].ket_qua === last6[i+1].ket_qua) { ok = false; break; }
    }
    if (!ok) return null;
    return {
      ten: 'Cầu 1-1',
      mo_ta: 'Tài/Xỉu xen kẽ liên tục',
      du_doan: last6[0].ket_qua === 'Tài' ? 'Xỉu' : 'Tài',
      trong_so: 20
    };
  }

  // 3. Cầu 2-1
  cau2_1() {
    if (this.history.length < 9) return null;
    const last9 = this.history.slice(0, 9);
    let ok = true;
    for (let i = 0; i < 6; i += 3) {
      if (!(last9[i].ket_qua === last9[i+1].ket_qua && last9[i].ket_qua !== last9[i+2].ket_qua)) {
        ok = false; break;
      }
    }
    if (!ok) return null;
    return {
      ten: 'Cầu 2-1',
      mo_ta: `2 ${last9[0].ket_qua} - 1 ${last9[2].ket_qua}`,
      du_doan: last9[0].ket_qua,
      trong_so: 18
    };
  }

  // 4. Cầu 3-1
  cau3_1() {
    if (this.history.length < 12) return null;
    const last12 = this.history.slice(0, 12);
    let ok = true;
    for (let i = 0; i < 8; i += 4) {
      if (!(last12[i].ket_qua === last12[i+1].ket_qua && 
            last12[i].ket_qua === last12[i+2].ket_qua && 
            last12[i].ket_qua !== last12[i+3].ket_qua)) {
        ok = false; break;
      }
    }
    if (!ok) return null;
    return {
      ten: 'Cầu 3-1',
      mo_ta: `3 ${last12[0].ket_qua} - 1 ${last12[3].ket_qua}`,
      du_doan: last12[0].ket_qua,
      trong_so: 16
    };
  }

  // 5. Điểm TB 10 phiên
  diemTB10() {
    if (this.history.length < 10) return null;
    const avg = this.history.slice(0, 10).reduce((s, h) => s + h.point, 0) / 10;
    return {
      ten: 'Điểm TB 10 phiên',
      mo_ta: `Trung bình: ${avg.toFixed(1)}`,
      gia_tri: parseFloat(avg.toFixed(1)),
      du_doan: avg > 10.5 ? 'Tài' : 'Xỉu',
      trong_so: 12
    };
  }

  // 6. Điểm TB 20 phiên
  diemTB20() {
    if (this.history.length < 20) return null;
    const avg = this.history.slice(0, 20).reduce((s, h) => s + h.point, 0) / 20;
    return {
      ten: 'Điểm TB 20 phiên',
      mo_ta: `Trung bình: ${avg.toFixed(1)}`,
      gia_tri: parseFloat(avg.toFixed(1)),
      du_doan: avg > 10.5 ? 'Tài' : 'Xỉu',
      trong_so: 10
    };
  }

  // 7. Tần suất Tài/Xỉu 20 phiên
  tanSuat20() {
    if (this.history.length < 20) return null;
    let tai = 0, xiu = 0;
    this.history.slice(0, 20).forEach(h => {
      h.ket_qua === 'Tài' ? tai++ : xiu++;
    });
    const chenh = Math.abs(tai - xiu);
    return {
      ten: 'Tần suất 20 phiên',
      mo_ta: `Tài: ${tai} | Xỉu: ${xiu}`,
      tai: tai,
      xiu: xiu,
      chenh_lech: chenh,
      du_doan: tai > xiu + 3 ? 'Xỉu' : xiu > tai + 3 ? 'Tài' : null,
      trong_so: chenh >= 4 ? 14 : 8
    };
  }

  // 8. Tần suất Tài/Xỉu 50 phiên
  tanSuat50() {
    if (this.history.length < 50) return null;
    let tai = 0, xiu = 0;
    this.history.slice(0, 50).forEach(h => {
      h.ket_qua === 'Tài' ? tai++ : xiu++;
    });
    const chenh = Math.abs(tai - xiu);
    return {
      ten: 'Tần suất 50 phiên',
      mo_ta: `Tài: ${tai} | Xỉu: ${xiu}`,
      tai: tai,
      xiu: xiu,
      chenh_lech: chenh,
      du_doan: tai > xiu + 5 ? 'Xỉu' : xiu > tai + 5 ? 'Tài' : null,
      trong_so: chenh >= 6 ? 12 : 6
    };
  }

  // 9. Xu hướng điểm
  xuHuongDiem() {
    if (this.history.length < 5) return null;
    const last5 = this.history.slice(0, 5);
    let trend = 0;
    for (let i = 0; i < 4; i++) {
      if (last5[i].point > last5[i+1].point) trend++;
      else if (last5[i].point < last5[i+1].point) trend--;
    }
    return {
      ten: 'Xu hướng điểm',
      mo_ta: trend > 2 ? 'Đang giảm' : trend < -2 ? 'Đang tăng' : 'Ổn định',
      du_doan: trend > 2 ? 'Xỉu' : trend < -2 ? 'Tài' : null,
      trong_so: Math.abs(trend) >= 3 ? 10 : 5
    };
  }

  // 10. Min/Max
  minMax() {
    if (this.history.length < 10) return null;
    const points = this.history.slice(0, 10).map(h => h.point);
    const max = Math.max(...points);
    const min = Math.min(...points);
    return {
      ten: 'Min/Max 10 phiên',
      mo_ta: `Thấp: ${min} | Cao: ${max}`,
      du_doan: max >= 16 ? 'Xỉu' : min <= 5 ? 'Tài' : null,
      trong_so: (max >= 17 || min <= 3) ? 12 : 6
    };
  }

  // 11. Xúc xắc nóng
  xucXacHot() {
    if (this.history.length < 10) return null;
    const freq = {};
    this.history.slice(0, 10).forEach(h => {
      h.dices.forEach(d => { freq[d] = (freq[d] || 0) + 1; });
    });
    let hot = null, maxF = 0;
    for (const [num, count] of Object.entries(freq)) {
      if (count > maxF) { maxF = count; hot = parseInt(num); }
    }
    return {
      ten: 'Xúc xắc nóng',
      mo_ta: `Số ${hot} xuất hiện ${maxF} lần`,
      du_doan: hot >= 5 ? 'Tài' : hot <= 2 ? 'Xỉu' : null,
      trong_so: 7
    };
  }

  // 12. Cầu gãy
  cauGay() {
    if (this.history.length < 4) return null;
    const last4 = this.history.slice(0, 4);
    if (last4[0].ket_qua !== last4[1].ket_qua && 
        last4[1].ket_qua === last4[2].ket_qua && 
        last4[2].ket_qua === last4[3].ket_qua) {
      return {
        ten: 'Cầu Gãy',
        mo_ta: `Cầu ${last4[1].ket_qua} dài vừa gãy`,
        du_doan: last4[1].ket_qua === 'Tài' ? 'Xỉu' : 'Tài',
        trong_so: 14
      };
    }
    return null;
  }

  // 13. Điểm lặp
  diemLap() {
    if (this.history.length < 5) return null;
    const points = this.history.slice(0, 5).map(h => h.point);
    const freq = {};
    points.forEach(p => { freq[p] = (freq[p] || 0) + 1; });
    for (const [p, c] of Object.entries(freq)) {
      if (c >= 3) {
        return {
          ten: 'Điểm Lặp',
          mo_ta: `Điểm ${p} lặp ${c} lần`,
          du_doan: parseInt(p) >= 11 ? 'Tài' : 'Xỉu',
          trong_so: 9
        };
      }
    }
    return null;
  }

  // 14. Chẵn/Lẻ
  chanLe() {
    if (this.history.length < 10) return null;
    let chan = 0, le = 0;
    this.history.slice(0, 10).forEach(h => {
      h.point % 2 === 0 ? chan++ : le++;
    });
    return {
      ten: 'Chẵn/Lẻ',
      mo_ta: `Chẵn: ${chan} | Lẻ: ${le}`,
      du_doan: chan > le + 2 ? 'Xỉu' : le > chan + 2 ? 'Tài' : null,
      trong_so: 5
    };
  }

  // 15. Tổng xúc xắc
  tongXucXac() {
    if (this.history.length < 5) return null;
    const avg = this.history.slice(0, 5)
      .reduce((s, h) => s + h.dices.reduce((a, b) => a + b, 0), 0) / 5;
    return {
      ten: 'Tổng xúc xắc TB',
      mo_ta: `TB: ${avg.toFixed(1)}`,
      du_doan: avg > 10.5 ? 'Tài' : 'Xỉu',
      trong_so: 8
    };
  }

  // ========== PHÂN TÍCH TỔNG ==========
  analyzeAll() {
    this.patterns = [];
    
    const methods = [
      this.cauBet, this.cau1_1, this.cau2_1, this.cau3_1,
      this.diemTB10, this.diemTB20, this.tanSuat20, this.tanSuat50,
      this.xuHuongDiem, this.minMax, this.xucXacHot, this.cauGay,
      this.diemLap, this.chanLe, this.tongXucXac
    ];

    methods.forEach(method => {
      const result = method.call(this);
      if (result) this.patterns.push(result);
    });

    return this.patterns;
  }

  // ========== DỰ ĐOÁN ==========
  predict() {
    const patterns = this.analyzeAll();
    
    if (patterns.length < 15) {
      return {
        status: 'error',
        message: `Chỉ có ${patterns.length}/15 pattern khả dụng`,
        patterns_found: patterns.length,
        patterns: patterns
      };
    }

    let scoreTai = 0, scoreXiu = 0;
    const activePatterns = [];

    patterns.forEach(p => {
      if (p.du_doan === 'Tài') {
        scoreTai += p.trong_so;
        activePatterns.push({ ten: p.ten, du_doan: 'Tài', trong_so: p.trong_so, mo_ta: p.mo_ta });
      } else if (p.du_doan === 'Xỉu') {
        scoreXiu += p.trong_so;
        activePatterns.push({ ten: p.ten, du_doan: 'Xỉu', trong_so: p.trong_so, mo_ta: p.mo_ta });
      }
    });

    const finalPredict = scoreTai > scoreXiu ? 'Tài' : 'Xỉu';
    const totalScore = scoreTai + scoreXiu;
    const confidence = totalScore > 0 ? Math.round((Math.max(scoreTai, scoreXiu) / totalScore) * 100) : 50;

    const last = this.history[0];

    return {
      status: 'success',
      phien_hien_tai: {
        id: last.id,
        ket_qua: last.ket_qua,
        diem: last.point,
        xuc_xac: last.dices
      },
      phien_du_doan: {
        id: last.id + 1,
        du_doan: finalPredict,
        do_tin_cay: confidence + '%',
        diem_tai: scoreTai,
        diem_xiu: scoreXiu,
        tong_pattern: patterns.length
      },
      patterns_active: activePatterns.sort((a, b) => b.trong_so - a.trong_so),
      khuyen_nghi: confidence >= 70 
        ? `Nên đánh ${finalPredict} - Độ tin cậy cao` 
        : confidence >= 55 
          ? `Cân nhắc ${finalPredict} - Độ tin cậy trung bình`
          : `Rủi ro cao - Cân nhắc không đánh`
    };
  }
}

// ==========================================
// ROUTES
// ==========================================
const ai = new LC79AI();

// Endpoint dự đoán
app.get('/vanhoa', async (req, res) => {
  try {
    const hasData = await ai.fetchData();
    if (!hasData) {
      return res.json({
        status: 'error',
        message: 'Không thể lấy dữ liệu từ server'
      });
    }
    
    if (ai.history.length < 15) {
      return res.json({
        status: 'error',
        message: `Cần ít nhất 15 phiên (hiện có ${ai.history.length})`,
        data: null
      });
    }
    
    const result = ai.predict();
    res.json(result);
  } catch (e) {
    res.status(500).json({
      status: 'error',
      message: 'Lỗi server: ' + e.message
    });
  }
});

// Endpoint kiểm tra
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'LC79 TXMD5',
    phiên_hiện_có: ai.history.length,
    timestamp: new Date().toISOString()
  });
});

// Trang chủ
app.get('/', (req, res) => {
  res.json({
    game: 'LC79 TXMD5 AI Predictor',
    version: '1.0.0',
    author: 'AI Assistant',
    endpoints: {
      du_doan: '/vanhoa',
      kiem_tra: '/health'
    },
    mo_ta: 'AI dự đoán Tài/Xỉu với 15+ pattern phân tích',
    luu_y: 'Dự đoán chỉ mang tính tham khảo'
  });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log('========================================');
  console.log('  LC79 TXMD5 AI PREDICTOR');
  console.log(`  Server: http://localhost:${PORT}`);
  console.log(`  Dự đoán: http://localhost:${PORT}/vanhoa`);
  console.log('========================================');
});
