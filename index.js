require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- MongoDB ---


const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

let db, usersCollection, galleryCollection;

async function initDB() {
  try {
    await client.connect();
    db = client.db("Pixhub");
    usersCollection = db.collection("user");
    galleryCollection = db.collection("gallery");
    console.log("✅ Connecté à MongoDB Atlas !");
  } catch (err) {
    console.error("❌ Erreur MongoDB :", err);
  }
}

initDB();

// --- Multer upload ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });
app.use("/uploads", express.static("uploads"));

// --- Routes ---
// Inscription
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: "Tous les champs sont requis" });

    const existing = await usersCollection.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email déjà utilisé" });

    const result = await usersCollection.insertOne({ username, email, password });
    res.status(201).json({ id: result.insertedId, username, email });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur inscription" });
  }
});

// Connexion
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
    if (user.password !== password)
      return res.status(401).json({ error: "Mot de passe incorrect" });

    res.json({ id: user._id, username: user.username, email: user.email });
  } catch {
    res.status(500).json({ error: "Erreur connexion" });
  }
});

// Créer une galerie
app.post("/api/gallery", async (req, res) => {
  try {
    const { title, description, ownerId } = req.body;
    if (!title || !ownerId) return res.status(400).json({ error: "Titre et ownerId requis" });

    const user = await usersCollection.findOne({ _id: new ObjectId(ownerId) });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const newGallery = { title, description: description || "", ownerId: new ObjectId(ownerId), media: [], createdAt: new Date() };
    const result = await galleryCollection.insertOne(newGallery);

    res.status(201).json({ id: result.insertedId, ...newGallery });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur création galerie" });
  }
});

// Récupérer les galeries d’un utilisateur
app.get("/api/gallery/user/:ownerId", async (req, res) => {
  try {
    const { ownerId } = req.params;
    const galleries = await galleryCollection.find({ ownerId: new ObjectId(ownerId) }).toArray();
    res.status(200).json(galleries);
  } catch {
    res.status(500).json({ error: "Erreur récupération galeries" });
  }
});

// Supprimer une galerie
app.delete("/api/gallery/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await galleryCollection.deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Erreur suppression galerie" });
  }
});

// Ajouter un média à une galerie
app.post("/api/gallery/:galleryId/:userId/media", upload.single("file"), async (req, res) => {
  try {
    const { galleryId, userId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Fichier manquant" });

    const type = file.mimetype.startsWith("image") ? "image" : "video";
    const newMedia = { id: Date.now(), title: file.originalname, url: `/uploads/${file.filename}`, type, ownerId: new ObjectId(userId), isFavorite: false };

    await galleryCollection.updateOne({ _id: new ObjectId(galleryId) }, { $push: { media: newMedia } });
    res.status(201).json(newMedia);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur ajout média" });
  }
});
app.post("/test-upload", upload.single("file"), (req, res) => {
  console.log(req.file);
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
  res.json({ success: true, file: req.file });
});


// Lancer serveur
app.listen(PORT, () => console.log(`✅ Serveur sur http://localhost:${PORT}`));
