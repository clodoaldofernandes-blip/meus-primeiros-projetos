const admin = require('firebase-admin');

// Inicializa o Firebase Admin apenas uma vez
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // Permite chamadas vindas do navegador
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { email, senha } = req.body;

    // Confere a senha de administrador
    if (senha !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    if (!email) {
      return res.status(400).json({ error: 'E-mail não informado' });
    }

    // Acha o usuário no Firebase Authentication pelo e-mail
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    // Libera o plano PRO no Firestore
    await db.collection('usuarios').doc(uid).set({ pro: true }, { merge: true });

    return res.status(200).json({ message: 'PRO liberado com sucesso', email });

  } catch (erro) {
    console.error('Erro ao liberar PRO manualmente:', erro);
    if (erro.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'Nenhum cliente encontrado com esse e-mail' });
    }
    return res.status(500).json({ error: 'Erro interno ao liberar PRO' });
  }
};