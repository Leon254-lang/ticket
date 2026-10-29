const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");
const { AppError } = require("../utilities/errorHandler");

const imageTypes = {
  "image/jpeg": { extension: "jpg", signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { extension: "png", signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { extension: "webp", signature: (buffer) => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" },
  "image/gif": { extension: "gif", signature: (buffer) => ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6)) },
};

const parseImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!imageTypes[file.mimetype]) {
      return callback(new AppError("Upload a PNG, JPEG, WebP, or GIF image.", 400));
    }
    callback(null, true);
  },
}).single("image");

exports.receiveImage = (req, res, next) => {
  parseImage(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return next(new AppError("Image must be 5 MB or smaller.", 413));
      }
      return next(new AppError("Choose one supported image file to upload.", 400));
    }
    next(error);
  });
};

exports.uploadImage = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("Choose an image to upload.", 400);
    const type = imageTypes[req.file.mimetype];
    if (!type.signature(req.file.buffer)) {
      throw new AppError("The uploaded file content is not a valid supported image.", 400);
    }
    if (!mongoose.connection.db) {
      throw new AppError("Image storage is unavailable until MongoDB connects.", 503);
    }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "ticketifyUploads",
    });
    const id = new mongoose.Types.ObjectId();
    const upload = bucket.openUploadStreamWithId(
      id,
      `${crypto.randomUUID()}.${type.extension}`,
      { metadata: { contentType: req.file.mimetype } }
    );
    const completed = new Promise((resolve, reject) => {
      upload.once("finish", resolve);
      upload.once("error", reject);
    });
    upload.end(req.file.buffer);
    await completed;

    res.status(201).json({ data: { url: `/api/uploads/${id}` } });
  } catch (error) {
    next(error);
  }
};

exports.getImage = async (req, res, next) => {
  try {
    if (!/^[0-9a-f]{24}$/i.test(req.params.id)) {
      throw new AppError("Image not found.", 404);
    }
    if (!mongoose.connection.db) {
      throw new AppError("Image storage is unavailable until MongoDB connects.", 503);
    }
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "ticketifyUploads",
    });
    const [file] = await bucket.find({ _id: new mongoose.Types.ObjectId(req.params.id) }).toArray();
    if (!file) throw new AppError("Image not found.", 404);

    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "Content-Type": imageTypes[file.metadata?.contentType] ? file.metadata.contentType : "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    const download = bucket.openDownloadStream(file._id);
    download.on("error", next);
    download.pipe(res);
  } catch (error) {
    next(error);
  }
};
