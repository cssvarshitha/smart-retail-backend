const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const EXCEL_FILE = 'walmart dataset.xlsx';

// 📅 Convert Excel serial to date
function convertExcelDate(serial) {
  const excelEpoch = new Date(1899, 11, 30);
  const date = new Date(excelEpoch.getTime() + serial * 86400000);
  return date.toISOString().split('T')[0];
}

// 📖 Load and compute
function loadExcelData() {
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet);

  return rawData.map(item => {
  const expiryDate = typeof item.Expiry === 'number' ? convertExcelDate(item.Expiry) : item.Expiry;
  const today = new Date();
  const expiryObj = new Date(expiryDate);
  const daysLeft = Math.floor((expiryObj - today) / (1000 * 60 * 60 * 24));

  let discount = item['Discount %'] ?? 0;
  const discountedPrice = item.MRP * (1 - discount / 100);

  // Clean mapped object
  return {
    SKU: item.SKU,
    Name: item.Name,
    Category: item.Category,
    Qty: item.Qty,
    MRP: item.MRP,
    Expiry: expiryDate,
    ShelfNumber: item['Shelf Number'] || '',   // Normalized
    'Discount %': discount,
    'Discounted Price': +discountedPrice.toFixed(2),
    FlashSale: item.FlashSale || false
  };
});
}

// 💾 Save data
function saveToExcel(data) {
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet = XLSX.utils.json_to_sheet(data);
  workbook.Sheets[sheetName] = sheet;
  XLSX.writeFile(workbook, EXCEL_FILE);
}

// 📧 Forgot Password
app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'css.varshitha@gmail.com',
      pass: 'pfqwgovmwlguepnb'
    }
  });
  const mailOptions = {
    from: 'css.varshitha@gmail.com',
    to: email,
    subject: 'Reset Your Password - Smart Retail System',
    text: `Click the following link to reset your password:\nhttp://localhost:3000/reset-password.html`
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) return res.status(500).json({ message: 'Error sending email' });
    res.status(200).json({ message: 'Reset link sent successfully' });
  });
});

app.post('/api/reset-password', (req, res) => {
  const { email, newPassword } = req.body;
  console.log(`✅ Password reset for ${email}. New Password: ${newPassword}`);
  res.status(200).json({ message: 'Password updated successfully!' });
});

// 📦 Inventory APIs
app.get('/api/inventory', (req, res) => {
  res.json(loadExcelData());
});

app.post('/api/inventory', (req, res) => {
  const data = loadExcelData();
  data.push(req.body);
  saveToExcel(data);
  res.json({ message: 'Item added successfully!' });
});

// ⏳ Expiring Items
app.get('/api/expiring', (req, res) => {
  const data = loadExcelData();
  const today = new Date();
  const cutoff = new Date();
  cutoff.setDate(today.getDate() + 3); // Expiring in next 3 days
  const expiring = data.filter(item => {
    const exp = new Date(item.Expiry);
    return exp >= today && exp <= cutoff && item.FlashSale;
  });
  res.json(expiring);
});

// ⚡ Flash Sale - Full Table
app.get('/api/flash-sale', (req, res) => {
  res.json(loadExcelData());
});

app.post('/api/flash-sale/update', (req, res) => {
  const updates = req.body; // [{ SKU, Discount % }]
  const data = loadExcelData();
  updates.forEach(update => {
    const item = data.find(i => i.SKU === update.SKU);
    if (item) {
      item['Discount %'] = +update['Discount %'];
      item['Discounted Price'] = +(item.MRP * (1 - update['Discount %'] / 100)).toFixed(2);
      item.FlashSale = true;
    }
  });
  saveToExcel(data);
  res.json({ message: 'Flash Sale updated' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});