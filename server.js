
const http = require('http');
const https = require('https');
const url = require('url');

const CONFIG = {
    API_BASE: 'https://wtxmd52.tele68.com/v1/txmd5',
    PORT: process.env.PORT || 8080
};

// ============================================
// UTILS
// ============================================
function mean(arr) { return arr.reduce((a,b)=>a+b,0)/arr.length; }
function std(arr) { const m=mean(arr); return Math.sqrt(arr.reduce((s,x)=>s+(x-m)**2,0)/(arr.length-1)); }
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        (url.startsWith('https')?https:http).get(url, res => {
            let d='';
            res.on('data',c=>d+=c);
            res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} });
        }).on('error',reject);
    });
}

// ============================================
// THUẬT TOÁN 1: BẮT CẦU BỆT - DỰA VÀO CẦU ĐANG CHẠY
// ============================================
function alg1_BatCauBet(history) {
    const res = history.map(h=>h.result);
    // Tìm cầu bệt dài nhất đang chạy
    let bet = 1, type = res[0];
    for(let i=1;i<res.length;i++) {
        if(res[i]===type) bet++; else break;
    }
    // Nếu bệt >=3 thì bắt tiếp, nếu bệt >=5 thì gãy
    if(bet >= 5) return {pred: type==='TAI'?'XIU':'TAI', conf: 75, reason: `Bệt ${bet} dài -> bắt gãy`};
    if(bet >= 3) return {pred: type, conf: 65, reason: `Bệt ${bet} -> bắt tiếp`};
    return {pred: type, conf: 52, reason: `Bệt ${bet} ngắn -> theo đà`};
}

// ============================================
// THUẬT TOÁN 2: CẦU 1-1 (ĐẢO CHIỀU LIÊN TỤC)
// ============================================
function alg2_Cau11(history) {
    const res = history.map(h=>h.result);
    let count11 = 0;
    for(let i=1;i<Math.min(res.length,10);i++) {
        if(res[i] !== res[i-1]) count11++;
    }
    const rate = count11 / Math.min(res.length-1, 9);
    if(rate >= 0.7) return {pred: res[0]==='TAI'?'XIU':'TAI', conf: 70, reason: `Cầu 1-1 rõ (${Math.round(rate*100)}%) -> đảo`};
    if(rate <= 0.3) return {pred: res[0], conf: 65, reason: `Ít đảo (${Math.round(rate*100)}%) -> theo đà`};
    return {pred: res[0]==='TAI'?'XIU':'TAI', conf: 55, reason: `Tỉ lệ đảo ${Math.round(rate*100)}% -> đoán đảo`};
}

// ============================================
// THUẬT TOÁN 3: SOI ĐIỂM - BẮT ĐIỂM CAO/THẤP
// ============================================
function alg3_SoiDiem(history) {
    const pts = history.map(h=>h.point);
    const m = mean(pts);
    const s = std(pts);
    const r5 = mean(pts.slice(0,5));
    const r3 = mean(pts.slice(0,3));
    
    // Điểm đang bay cao -> sắp hạ
    if(r3 > m + s*0.5 && r5 > m + s*0.3) return {pred: 'XIU', conf: 72, reason: `Điểm cao (${r3.toFixed(1)}) -> đoán XIU`};
    // Điểm đang thấp -> sắp tăng
    if(r3 < m - s*0.5 && r5 < m - s*0.3) return {pred: 'TAI', conf: 72, reason: `Điểm thấp (${r3.toFixed(1)}) -> đoán TAI`};
    // Điểm gần TB -> theo trend
    if(r3 > m) return {pred: 'TAI', conf: 58, reason: `Điểm trên TB -> TAI`};
    return {pred: 'XIU', conf: 58, reason: `Điểm dưới TB -> XIU`};
}

// ============================================
// THUẬT TOÁN 4: SOI XÚC XẮC - CON NÀO ĐANG HOT
// ============================================
function alg4_SoiXucXac(history) {
    const all = [];
    history.forEach(h=>{ if(h.dices) h.dices.forEach(d=>all.push(d)); });
    const freq = {};
    all.forEach(d=>{ freq[d]=(freq[d]||0)+1; });
    
    // 3 con xuất hiện nhiều nhất
    const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
    const hot3 = sorted.slice(0,3).map(e=>parseInt(e[0]));
    const hotAvg = mean(hot3);
    
    if(hotAvg >= 4.2) return {pred: 'TAI', conf: 68, reason: `Xúc xắc nóng: ${hot3.join(',')} (avg ${hotAvg.toFixed(1)}) -> TAI`};
    if(hotAvg <= 2.8) return {pred: 'XIU', conf: 68, reason: `Xúc xắc nóng: ${hot3.join(',')} (avg ${hotAvg.toFixed(1)}) -> XIU`};
    return {pred: hotAvg>3.5?'TAI':'XIU', conf: 55, reason: `Xúc xắc TB: ${hotAvg.toFixed(1)}`};
}

// ============================================
// THUẬT TOÁN 5: SOI CHU KỲ - PHIÊN CHẴN LẺ
// ============================================
function alg5_ChanLe(history) {
    let eT=0,eX=0,oT=0,oX=0;
    history.forEach(h=>{
        if(h.id%2===0){ h.result==='TAI'?eT++:eX++; }
        else { h.result==='TAI'?oT++:oX++; }
    });
    const nextEven = (history[0].id+1)%2===0;
    if(nextEven) {
        if(eT>eX) return {pred:'TAI',conf:60,reason:`Phiên chẵn thường TAI (${eT}/${eT+eX})`};
        return {pred:'XIU',conf:60,reason:`Phiên chẵn thường XIU (${eX}/${eT+eX})`};
    } else {
        if(oT>oX) return {pred:'TAI',conf:60,reason:`Phiên lẻ thường TAI (${oT}/${oT+oX})`};
        return {pred:'XIU',conf:60,reason:`Phiên lẻ thường XIU (${oX}/${oT+oX})`};
    }
}

// ============================================
// THUẬT TOÁN 6: SOI TỔNG 3 PHIÊN GẦN NHẤT
// ============================================
function alg6_Tong3Phien(history) {
    if(history.length<4) return {pred:'TAI',conf:50,reason:'Chưa đủ dữ liệu'};
    const last3 = history.slice(0,3).map(h=>h.point);
    const sum = last3.reduce((a,b)=>a+b,0);
    const prev3 = history.slice(1,4).map(h=>h.point);
    const prevSum = prev3.reduce((a,b)=>a+b,0);
    
    // So sánh tổng 3 phiên
    if(sum > 33 && prevSum > 33) return {pred:'XIU',conf:70,reason:`Tổng 3P cao (${sum}) -> giảm`};
    if(sum < 30 && prevSum < 30) return {pred:'TAI',conf:70,reason:`Tổng 3P thấp (${sum}) -> tăng`};
    if(sum > prevSum + 3) return {pred:'XIU',conf:62,reason:`Tổng tăng mạnh -> XIU`};
    if(sum < prevSum - 3) return {pred:'TAI',conf:62,reason:`Tổng giảm mạnh -> TAI`};
    return {pred: sum>=31.5?'TAI':'XIU', conf:54, reason:`Tổng 3P=${sum}`};
}

// ============================================
// THUẬT TOÁN 7: BẮT NHỊP 2-1 (2 TÀI 1 XỈU hoặc ngược lại)
// ============================================
function alg7_Nhip21(history) {
    const res = history.map(h=>h.result);
    if(res.length<4) return {pred:'TAI',conf:50,reason:'Chưa đủ dữ liệu'};
    
    const last4 = res.slice(0,4);
    // Pattern: TAI-TAI-XIU-? -> dự đoán TAI (2-1-2-1)
    if(last4[0]===last4[1] && last4[1]!==last4[2]) {
        // Đang là XXY -> dự đoán X
        return {pred: last4[0], conf: 67, reason: `Nhịp 2-1: ${last4.slice(0,3).join('-')} -> ${last4[0]}`};
    }
    // Pattern: TAI-XIU-XIU-? -> dự đoán TAI
    if(last4[0]!==last4[1] && last4[1]===last4[2]) {
        return {pred: last4[0], conf: 67, reason: `Nhịp 1-2: ${last4.slice(0,3).join('-')} -> ${last4[0]}`};
    }
    return {pred: res[0]==='TAI'?'XIU':'TAI', conf:53, reason:'Không rõ nhịp'};
}

// ============================================
// THUẬT TOÁN 8: SOI LỊCH SỬ ĐỐI XỨNG
// ============================================
function alg8_DoiXung(history) {
    const res = history.map(h=>h.result);
    if(res.length<6) return {pred:'TAI',conf:50,reason:'Chưa đủ dữ liệu'};
    
    // Kiểm tra 5 phiên gần nhất có đối xứng không
    const last5 = res.slice(0,5);
    // Đối xứng dạng ABCBA
    if(last5[0]===last5[4] && last5[1]===last5[3]) {
        return {pred: last5[2]==='TAI'?'XIU':'TAI', conf:75, reason:`Đối xứng ABCBA -> đảo`};
    }
    // Đối xứng dạng ABABA
    if(last5[0]===last5[2] && last5[2]===last5[4] && last5[1]===last5[3] && last5[0]!==last5[1]) {
        return {pred: res[0]==='TAI'?'XIU':'TAI', conf:78, reason:`Nhịp ABABA -> đảo`};
    }
    return {pred: res[0], conf:52, reason:'Không đối xứng -> theo đà'};
}

// ============================================
// ENSEMBLE TỔNG HỢP 8 THUẬT TOÁN
// ============================================
function superVIPPredict(history) {
    if(!history||history.length<5) return {prediction:'TAI',confidence:50,error:'Cần ít nhất 5 phiên'};

    const algs = [
        {name:'Bắt cầu bệt', fn:alg1_BatCauBet, w:0.18},
        {name:'Cầu 1-1 đảo chiều', fn:alg2_Cau11, w:0.15},
        {name:'Soi điểm cao/thấp', fn:alg3_SoiDiem, w:0.14},
        {name:'Soi xúc xắc nóng', fn:alg4_SoiXucXac, w:0.12},
        {name:'Chu kỳ chẵn lẻ', fn:alg5_ChanLe, w:0.08},
        {name:'Tổng 3 phiên gần', fn:alg6_Tong3Phien, w:0.12},
        {name:'Bắt nhịp 2-1', fn:alg7_Nhip21, w:0.11},
        {name:'Soi đối xứng', fn:alg8_DoiXung, w:0.10}
    ];

    let sT=0,sX=0,tw=0;
    const details = algs.map(a=>{
        const r = a.fn(history);
        const conf = r.conf/100;
        tw+=a.w;
        if(r.pred==='TAI') sT+=a.w*conf; else sX+=a.w*conf;
        return {name:a.name, prediction:r.pred, confidence:r.conf, reason:r.reason};
    });

    sT/=tw; sX/=tw;
    const pred = sT>sX?'TAI':'XIU';
    const conf = Math.round((Math.max(sT,sX)/(sT+sX))*100);

    return {
        prediction: pred,
        confidence: conf,
        scoreTAI: Math.round(sT*100),
        scoreXIU: Math.round(sX*100),
        voteTAI: details.filter(d=>d.prediction==='TAI').length,
        voteXIU: details.filter(d=>d.prediction==='XIU').length,
        algorithms: details
    };
}

// ============================================
// FETCH API
// ============================================
async function getData() {
    try {
        const data = await fetchJSON(`${CONFIG.API_BASE}/sessions`);
        if(!data||!data.list) return null;
        return {
            list: data.list.map(s=>({id:s.id,result:s.resultTruyenThong,dices:s.dices,point:s.point})),
            stats: data.typeStat||{TAI:0,XIU:0}
        };
    }catch(e){ return null; }
}

// ============================================
// HTML RENDER
// ============================================
function html(pred, history, stats) {
    const pc = pred.prediction==='TAI'?'#00ff88':'#ff4444';
    const pg = pred.prediction==='TAI'?'0 0 50px rgba(0,255,136,0.7)':'0 0 50px rgba(255,68,68,0.7)';
    
    const algoRows = pred.algorithms.map((a,i)=>{
        const c=a.prediction==='TAI'?'#00ff88':'#ff4444';
        return `<div class="ar">
            <span class="an">${i+1}. ${a.name}</span>
            <span class="ap" style="color:${c}">${a.prediction}</span>
            <span class="ac">${a.confidence}%</span>
            <span class="ar2">${a.reason}</span>
        </div>`;
    }).join('');

    const hRows = history.slice(0,30).map((h,i)=>{
        const c=h.result==='TAI'?'#00ff88':'#ff4444';
        const bg=i%2===0?'rgba(255,255,255,0.02)':'rgba(255,255,255,0.05)';
        return `<tr style="background:${bg}">
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
    <title>🔮 SUPER VIP PREDICTOR - TÀI XỈU</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',system-ui;background:linear-gradient(180deg,#0a0a14,#1a1a30,#0d0d1a);color:#fff;min-height:100vh}
        .container{max-width:1000px;margin:0 auto;padding:15px}
        .header{text-align:center;padding:25px 0;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:20px}
        .header h1{font-size:2em;background:linear-gradient(45deg,#ffd700,#ff6b6b,#00ff88,#ffd700);background-size:300% 300%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:grad 3s ease infinite}
        @keyframes grad{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        .header p{color:#888;font-size:.8em;margin-top:5px}
        
        .pred-box{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:30px;text-align:center;margin-bottom:18px}
        .pred-id{color:#ffd700;font-size:1em;margin-bottom:8px}
        .pred-result{font-size:4.5em;font-weight:900;letter-spacing:8px;animation:pulse 2s ease-in-out infinite}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
        .conf-bar{width:100%;height:32px;background:rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;margin:15px 0}
        .conf-fill{height:100%;border-radius:16px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:.85em}
        .scores{display:flex;justify-content:center;gap:35px;margin:15px 0}
        .scores .tai{color:#00ff88;font-size:1.8em;font-weight:bold}
        .scores .xiu{color:#ff4444;font-size:1.8em;font-weight:bold}
        .scores .vs{color:#ffd700;font-size:1.5em}
        .badges{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin:15px 0}
        .badge{padding:7px 18px;border-radius:20px;font-weight:bold;font-size:.8em}
        .bt{background:rgba(0,255,136,0.12);color:#00ff88;border:1px solid rgba(0,255,136,0.25)}
        .bx{background:rgba(255,68,68,0.12);color:#ff4444;border:1px solid rgba(255,68,68,0.25)}
        .ba{background:rgba(255,215,0,0.12);color:#ffd700;border:1px solid rgba(255,215,0,0.25)}
        
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
        @media(max-width:768px){.grid{grid-template-columns:1fr}}
        .card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px}
        .card h3{color:#ffd700;font-size:1em;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,215,0,0.15)}
        
        .ar{display:grid;grid-template-columns:1fr 50px 45px;gap:5px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:.8em;align-items:center}
        .ar .an{color:#aaa}
        .ar .ap{font-weight:bold;text-align:center}
        .ar .ac{text-align:right;color:#888}
        .ar .ar2{grid-column:1/-1;color:#666;font-size:.75em;padding-left:15px}
        
        .tbl-scroll{max-height:420px;overflow-y:auto;border-radius:8px}
        .tbl-scroll::-webkit-scrollbar{width:4px}
        .tbl-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,0.02)}
        .tbl-scroll::-webkit-scrollbar-thumb{background:rgba(255,215,0,0.2);border-radius:3px}
        table{width:100%;border-collapse:collapse;font-size:.8em}
        th{color:#ffd700;padding:10px 8px;text-align:left;border-bottom:2px solid rgba(255,215,0,0.25);position:sticky;top:0;background:#1a1a30}
        td{padding:8px;border-bottom:1px solid rgba(255,255,255,0.03)}
        
        .btn{display:block;margin:20px auto;background:linear-gradient(45deg,#ffd700,#ffaa00);color:#000;border:none;padding:12px 30px;border-radius:25px;font-weight:bold;cursor:pointer;transition:.3s;font-size:.95em}
        .btn:hover{transform:scale(1.04);box-shadow:0 5px 20px rgba(255,215,0,0.35)}
        .footer{text-align:center;padding:15px;color:#555;font-size:.7em}
        .vote{text-align:center;color:#888;font-size:.8em;margin:8px 0}
        .vote .vt{color:#00ff88;font-weight:bold}
        .vote .vx{color:#ff4444;font-weight:bold}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔮 SUPER VIP AI PREDICTOR</h1>
            <p>8 Thuật toán bắt cầu siêu VIP | Phân tích TÀI/XỈU chuyên sâu</p>
        </div>
        
        <div class="pred-box">
            <div class="pred-id">🎯 PHIÊN DỰ ĐOÁN #${pred.nextId}</div>
            <div class="pred-result" style="color:${pc};text-shadow:${pg}">${pred.prediction}</div>
            <div class="conf-bar"><div class="conf-fill" style="width:${pred.confidence}%;background:${pc}">ĐỘ TIN CẬY: ${pred.confidence}%</div></div>
            <div class="scores">
                <div><div class="tai">${pred.scoreTAI}%</div><small style="color:#888">TÀI</small></div>
                <div class="vs">⚡</div>
                <div><div class="xiu">${pred.scoreXIU}%</div><small style="color:#888">XỈU</small></div>
            </div>
            <div class="vote">🗳 Thuật toán bầu: <span class="vt">${pred.voteTAI} TÀI</span> | <span class="vx">${pred.voteXIU} XỈU</span></div>
            <div class="badges">
                <span class="badge bt">TÀI: ${stats.TAI}</span>
                <span class="badge bx">XỈU: ${stats.XIU}</span>
                <span class="badge ba">TỔNG: ${stats.TAI+stats.XIU} phiên</span>
            </div>
        </div>
        
        <div class="grid">
            <div class="card">
                <h3>🧠 8 THUẬT TOÁN SIÊU VIP</h3>
                ${algoRows}
            </div>
            <div class="card">
                <h3>📜 LỊCH SỬ PHIÊN</h3>
                <div class="tbl-scroll">
                    <table>
                        <thead><tr><th>ID</th><th>KQ</th><th>ĐIỂM</th><th>XÚC XẮC</th></tr></thead>
                        <tbody>${hRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <button class="btn" onclick="location.reload()">🔄 DỰ ĐOÁN LẠI</button>
        <div class="footer">⚠️ Công cụ phân tích Lab | Super VIP Predictor v5.0 | 8 Algorithms</div>
    </div>
</body>
</html>`;
}

// ============================================
// SERVER
// ============================================
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    if(req.method==='OPTIONS'){ res.writeHead(204); return res.end(); }

    const pathname = url.parse(req.url).pathname;

    try {
        const data = await getData();
        if(!data) {
            res.writeHead(500,{'Content-Type':'text/html; charset=utf-8'});
            return res.end('<h1>Lỗi kết nối API nguồn</h1>');
        }

        const pred = superVIPPredict(data.list);
        const nextId = data.list.length>0 ? data.list[0].id+1 : 1;
        const fullPred = {...pred, nextId};

        if(pathname==='/vanhoa') {
            // JSON API
            res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
            return res.end(JSON.stringify({
                success:true,
                nextId,
                prediction: pred.prediction,
                confidence: pred.confidence,
                scoreTAI: pred.scoreTAI,
                scoreXIU: pred.scoreXIU,
                voteTAI: pred.voteTAI,
                voteXIU: pred.voteXIU,
                algorithms: pred.algorithms.map(a=>({name:a.name,prediction:a.prediction,confidence:a.confidence,reason:a.reason})),
                stats: data.stats
            },null,2));
        }

        // HTML
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        res.end(html(fullPred, data.list, data.stats));

    } catch(e) {
        res.writeHead(500,{'Content-Type':'text/html; charset=utf-8'});
        res.end(`<h1>Lỗi server: ${e.message}</h1>`);
    }
});

server.listen(CONFIG.PORT, () => {
    console.log(`🚀 Super VIP Predictor chạy tại port ${CONFIG.PORT}`);
    console.log(`🌐 Web: http://localhost:${CONFIG.PORT}`);
    console.log(`📡 API: http://localhost:${CONFIG.PORT}/vanhoa`);
});
