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

// Deixa o texto sem acentos e em minúsculas, para comparar nomes com segurança
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Descobre qual produto foi comprado.
// 1º: pelo "produto=" no endereço do webhook (o mais confiável).
// 2º: pelo nome do produto que a Kiwify envia.
// 3º: se não der para saber, mantém o comportamento antigo (Estética Fácil).
function descobrirProduto(req, payload) {
  const pelaUrl = normalizar(req.query.produto).trim();
  if (PRODUTOS[pelaUrl]) return { chave: pelaUrl, origem: 'endereço do webhook' };

  const nome = normalizar(
    payload?.Product?.product_name ||
    payload?.product?.name ||
    payload?.product?.product_name ||
    payload?.product_name
  );

  if (nome.includes('fisio')) return { chave: 'fisio', origem: 'nome do produto' };
  if (nome.includes('estetica')) return { chave: 'estetica', origem: 'nome do produto' };
  if (nome.includes('cliente')) return { chave: 'cliente', origem: 'nome do produto' };

  return { chave: 'estetica', origem: 'padrão (produto não identificado)' };
}

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
    const payload = req.body || {};

    // Confere se a compra foi realmente aprovada/paga
    const status = payload.order_status || payload.status;
    if (status !== 'paid' && status !== 'approved') {
      return res.status(200).json({ message: 'Status não é de compra aprovada, ignorado.' });
    }

    // Pega o e-mail do cliente (tenta os formatos mais comuns da Kiwify)
    const email = String(
      payload?.Customer?.email ||
      payload?.customer?.email ||
      payload?.customer_email ||
      ''
    ).trim().toLowerCase();

    if (!email) {
      console.error('E-mail do cliente não encontrado no payload:', JSON.stringify(payload));
      return res.status(400).json({ error: 'E-mail do cliente não encontrado' });
    }

    // Descobre qual produto liberar
    const { chave, origem } = descobrirProduto(req, payload);
    const produto = PRODUTOS[chave];

    if (origem.startsWith('padrão')) {
      console.warn('Produto não identificado no webhook; usando Estética Fácil. Payload:', JSON.stringify(payload));
    }

    // Acha o usuário no Firebase Authentication pelo e-mail
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    // Libera o plano PRO do produto comprado no Firestore
    await db.collection('usuarios').doc(uid).set({ [produto.campo]: true }, { merge: true });

    console.log(`PRO do ${produto.nome} liberado com sucesso para: ${email} (uid: ${uid}) — identificado por: ${origem}`);
    return res.status(200).json({
      message: 'PRO liberado com sucesso',
      email,
      produto: produto.nome,
    });

  } catch (erro) {
    if (erro.code === 'auth/user-not-found') {
      // O comprador ainda não criou a conta no sistema com esse e-mail
      console.error('Compra aprovada, mas não existe conta com o e-mail do comprador. Liberar manualmente pelo painel.');
      return res.status(404).json({ error: 'Nenhuma conta encontrada com o e-mail do comprador' });
    }
    console.error('Erro ao processar webhook:', erro);
    return res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
};
