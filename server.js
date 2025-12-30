
const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const app = express();
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  next();
});


/* ------------------ DB CONNECTION ------------------ */
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "root",
  database: "verifier"
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL Connection Failed");
    console.error(err.message);
    process.exit(1);
  }
  console.log("✅ MySQL Connected Successfully");
});

/* ------------------ FILE UPLOAD (ADMIN) ------------------ */
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
app.post("/verify", (req, res) => {
  const { code, mobile, purchase_source } = req.body;
  console.log("PURCHASE SOURCE:", purchase_source);


  // Mandatory validation
  if (!code || !mobile || !purchase_source) {
    return res.render("index", {
      message: "Please fill all required fields.",
      success: false
    });
  }

  // Mobile validation (10 digits)
  if (!/^[0-9]{10}$/.test(mobile.trim())) {
    return res.render("index", {
      message: "Please enter a valid 10-digit mobile number.",
      success: false
    });
  }

  const cleanCode = code.trim();
  const cleanMobile = mobile.trim();
  const cleanSource = purchase_source.trim();

  db.query(
    `
    UPDATE product_codes
    SET status = 'Used',
        verified_at = NOW(),
        mobile = ?,
        purchase_source = ?
    WHERE code = ? AND status = 'Unused'
    `,
    [cleanMobile, cleanSource, cleanCode],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.render("index", {
          message: "Something went wrong. Please try again.",
          success: false
        });
      }

      if (result.affectedRows === 0) {
        return res.render("index", {
          message: "This code is invalid or already verified.",
          success: false
        });
      }

      return res.render("index", {
        message: "Product verified successfully!",
        success: true
      });
    }
  );
});

/* ------------------ ADMIN PANEL ------------------ */
app.get("/admin", (req, res) => {
  res.render("admin", { message: null });
});

/* ------------------ ADMIN UPLOAD ------------------ */
app.post("/admin/upload", upload.single("file"), (req, res) => {
  const batchName = req.body.batch_name;
  const filePath = req.file.path;

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  db.query(
    "INSERT INTO batches (batch_name) VALUES (?)",
    [batchName],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.render("admin", {
          message: "Failed to create batch"
        });
      }

      const batchId = result.insertId;

      rows.forEach(row => {
        if (row.Code) {
          db.query(
            "INSERT IGNORE INTO product_codes (batch_id, code) VALUES (?, ?)",
            [batchId, row.Code.toString().trim()]
          );
        }
      });

      // Optional: keep uploaded file
      // fs.unlinkSync(filePath);

      res.render("admin", {
        message: `✅ ${rows.length} codes uploaded to "${batchName}"`
      });
    }
  );
});

/* ------------------ SERVER ------------------ */
app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
