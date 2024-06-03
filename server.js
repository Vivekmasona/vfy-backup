const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory store for file codes
const fileCodes = new Map();

// Serve the index.html file when the root URL is accessed
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/audio';
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Route to handle file upload
app.post('/upload', upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const filePath = path.join(__dirname, req.file.path);
    const fileUrl = `${req.protocol}://${req.get('host')}/${req.file.path}`;

    // Generate a random code for the file
    const fileCode = crypto.randomBytes(4).toString('hex');
    fileCodes.set(fileCode, filePath);

    // Schedule file deletion after 1 hour
    const deleteDate = new Date(Date.now() + 3600000); // 1 hour from now
    schedule.scheduleJob(deleteDate, () => {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            fileCodes.delete(fileCode);
            console.log(`Deleted file: ${filePath}`);
        }
    });

    res.json({ url: `${req.protocol}://${req.get('host')}/play/${fileCode}` });
});

// Route to play the audio file using the random code
app.get('/play/:code', (req, res) => {
    const fileCode = req.params.code;
    const filePath = fileCodes.get(fileCode);

    if (!filePath) {
        return res.status(404).send('File not found.');
    }

    res.sendFile(filePath);
});

// Route to get the URL of the latest uploaded audio file
app.get('/latest', (req, res) => {
    const uploadPath = path.join(__dirname, 'uploads', 'audio');
    fs.readdir(uploadPath, (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            return res.status(500).send('Internal Server Error');
        }

        // Sort files by modification time
        files.sort((a, b) => {
            return fs.statSync(path.join(uploadPath, b)).mtime.getTime() -
                   fs.statSync(path.join(uploadPath, a)).mtime.getTime();
        });

        // Get the latest file
        const latestFile = files[0];
        const filePath = path.join(uploadPath, latestFile);

        // Generate a random code for the latest file if not already generated
        let fileCode;
        for (const [code, path] of fileCodes.entries()) {
            if (path === filePath) {
                fileCode = code;
                break;
            }
        }
        if (!fileCode) {
            fileCode = crypto.randomBytes(4).toString('hex');
            fileCodes.set(fileCode, filePath);
        }

        const fileUrl = `${req.protocol}://${req.get('host')}/play/${fileCode}`;

        // Return the URL of the latest file
        res.json({ url: fileUrl });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

