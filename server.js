const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const Batch = require("./models/Batch");
const ProductCode = require("./models/ProductCode");

const app = express();
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  next();
});

/* ------------------ DB CONNECTION ------------------ */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

/* ------------------ FILE UPLOAD ------------------ */
const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) =>
    file.originalname.endsWith(".xlsx")
      ? cb(null, true)
      : cb(new Error("Only Excel files allowed"))
});

/* ------------------ PUBLIC PAGE ------------------ */
app.get("/", (req, res) => {
  res.render("index", { message: null, success: null });
});

/* ------------------ VERIFY PRODUCT ------------------ */
app.post("/verify", async (req, res) => {
  const { code, mobile, purchase_source } = req.body;

  if (!code || !mobile || !purchase_source) {
    return res.render("index", {
      message: "Please fill all required fields.",
      success: false
    });
  }

  if (!/^[0-9]{10}$/.test(mobile.trim())) {
    return res.render("index", {
      message: "Please enter a valid 10-digit mobile number.",
      success: false
    });
  }

  const cleanCode = code.trim();

  const result = await ProductCode.findOneAndUpdate(
    { code: cleanCode, status: "Unused" },
    {
      status: "Used",
      mobile: mobile.trim(),
      purchase_source: purchase_source.trim(),
      verified_at: new Date()
    }
  );

  if (!result) {
    return res.render("index", {
      message: "This code is invalid or already verified.",
      success: false
    });
  }

  res.render("index", {
    message: "Product verified successfully!",
    success: true
  });
});

/* ------------------ ADMIN PANEL ------------------ */
app.get("/admin", (req, res) => {
  res.render("admin", { message: null });
});

/* ------------------ ADMIN UPLOAD ------------------ */
app.post("/admin/upload", upload.single("file"), async (req, res) => {
  try {
    const batchName = req.body.batch_name;
    const filePath = req.file.path;

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const batch = await Batch.create({ batch_name: batchName });

    let inserted = 0;

    for (let row of rows) {
      if (row.Code) {
        try {
          await ProductCode.create({
            batchId: batch._id,
            code: row.Code.toString().trim()
          });
          inserted++;
        } catch (e) {
          // duplicate code ignored
        }
      }
    }

    fs.unlinkSync(filePath);

    res.render("admin", {
      message: `✅ ${inserted} codes uploaded to "${batchName}"`
    });

  } catch (err) {
    console.error(err);
    res.render("admin", {
      message: "Failed to upload Excel file"
    });
  }
});

/* ------------------ SERVER ------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
