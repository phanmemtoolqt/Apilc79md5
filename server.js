const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Thay bằng API lịch sử của bạn
const HISTORY_API = "https://your-api-history.com/history";

function buildPattern(list) {
    return list.map(i => i.resultTruyenThong === "TAI" ? "T" : "X").join("");
}

function countTX(list) {
    let tai = 0;
    let xiu = 0;

    list.forEach(i => {
        if (i.resultTruyenThong === "TAI") tai++;
        else xiu++;
    });

    return { tai, xiu };
}

function predict(list) {
    const pattern = buildPattern(list);

    const last3 = pattern.slice(0, 3);

    let duDoan = "XIU";
    let doTinCay = 50;
    let lyDo = [];

    if (last3 === "TTT") {
        duDoan = "XIU";
        doTinCay = 70;
        lyDo.push("Bệt Tài 3");
    }
    else if (last3 === "XXX") {
        duDoan = "TAI";
        doTinCay = 70;
        lyDo.push("Bệt Xỉu 3");
    }
    else if (last3 === "TXT") {
        duDoan = "XIU";
        doTinCay = 60;
        lyDo.push("Cầu 1-1");
    }
    else if (last3 === "XTX") {
        duDoan = "TAI";
        doTinCay = 60;
        lyDo.push("Cầu 1-1");
    }

    return {
        du_doan: duDoan,
        do_tin_cay: doTinCay,
        ly_do: lyDo
    };
}

app.get("/", (req, res) => {
    res.json({
        status: "running"
    });
});

app.get("/api/predict", async (req, res) => {
    try {

        const response = await axios.get(HISTORY_API);

        const data = response.data.list;

        const last = data[0];

        const stats = countTX(data);

        const result = predict(data);

        res.json({
            phien_truoc: last.id,
            ket_qua_truoc: last.resultTruyenThong,
            tong_truoc: last.point,

            phien_du_doan: last.id + 1,

            pattern: buildPattern(data),

            thong_ke: stats,

            du_doan: result.du_doan,
            do_tin_cay: result.do_tin_cay + "%",

            ly_do: result.ly_do
        });

    } catch (e) {

        res.status(500).json({
            error: e.message
        });

    }
});

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
