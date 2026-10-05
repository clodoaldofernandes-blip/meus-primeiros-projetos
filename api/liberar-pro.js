const admin = require('firebase-admin');

// Inicializa o Firebase Admin apenas uma vez
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Cada produto tem o seu próprio campo de liberação no perfil do cliente
const PRODUTOS = {
  estetica: { campo: 'pro', nome: 'Estética Fácil' },
  cliente: { campo: 'proClienteFacil', nome: 'Cliente Fácil' },
  fisio: { campo: 'proFisioterapia', nome: 'Fisioterapia Fácil' },
};

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
    const { senha } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();

    // Se o produto não for informado, mantém o comportamento antigo (Estética Fácil)
    const chaveProduto = String(req.body.produto || 'estetica').trim().toLowerCase();

    // Confere a senha de administrador
    if (senha !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    if (!email) {
      return res.status(400).json({ error: 'E-mail não informado' });
    }

    const produto = PRODUTOS[chaveProduto];
    if (!produto) {
      return res.status(400).json({ error: 'Produto inválido' });
    }

    // Acha o usuário no Firebase Authentication pelo e-mail
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    // Libera o plano PRO do produto escolhido no Firestore
    await db.collection('usuarios').doc(uid).set({ [produto.campo]: true }, { merge: true });

    console.log(`PRO do ${produto.nome} liberado manualmente para: ${email} (uid: ${uid})`);
    return res.status(200).json({
      message: 'PRO liberado com sucesso',
      email,
      produto: produto.nome,
    });

  } catch (erro) {
    console.error('Erro ao liberar PRO manualmente:', erro);
    if (erro.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'Nenhum cliente encontrado com esse e-mail' });
    }
    return res.status(500).json({ error: 'Erro interno ao liberar PRO' });
  }
};
