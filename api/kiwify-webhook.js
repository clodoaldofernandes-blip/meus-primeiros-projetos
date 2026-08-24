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
  // Só aceita requisições do tipo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Confere o token secreto (segurança)
  const tokenRecebido = req.query.token;
  if (tokenRecebido !== process.env.KIWIFY_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const payload = req.body;

    // Confere se a compra foi realmente aprovada/paga
    const status = payload.order_status || payload.status;
    if (status !== 'paid' && status !== 'approved') {
      return res.status(200).json({ message: 'Status não é de compra aprovada, ignorado.' });
    }

    // Pega o e-mail do cliente (tenta os formatos mais comuns da Kiwify)
    const email =
      payload?.Customer?.email ||
      payload?.customer?.email ||
      payload?.customer_email;

    if (!email) {
      console.error('E-mail do cliente não encontrado no payload:', JSON.stringify(payload));
      return res.status(400).json({ error: 'E-mail do cliente não encontrado' });
    }

    // Acha o usuário no Firebase Authentication pelo e-mail
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    // Libera o plano PRO no Firestore
    await db.collection('usuarios').doc(uid).set({ pro: true }, { merge: true });

    console.log(`PRO liberado com sucesso para: ${email} (uid: ${uid})`);
    return res.status(200).json({ message: 'PRO liberado com sucesso', email });

  } catch (erro) {
    console.error('Erro ao processar webhook:', erro);
    return res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
};