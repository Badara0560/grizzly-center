/* Grizzly Center — serveur MCP en lecture seule.
 *
 * Le site grizzly-center.onrender.com est statique (Render) : il ne peut ni
 * exécuter un serveur MCP ni négocier le Markdown. Ce Worker porte le serveur
 * MCP que déclare /.well-known/mcp.json du site. Il ne connaît QUE ce que la page
 * publique affiche — coordonnées, horaires, services, gammes. Aucune donnée de la
 * caisse (grizzly-vidange), aucun prix, aucun stock, aucun appel payant.
 *
 * Si la page change (horaires, téléphone), mettre à jour BOUTIQUE ci-dessous.
 */

const SITE = 'https://grizzly-center.onrender.com';
const VERSION_PROTOCOLE = '2025-06-18';

const BOUTIQUE = {
  nom: 'Grizzly Center',
  role: 'Distributeur officiel MOTOREX au Mali',
  adresse: 'Magnambougou, Bamako, Mali',
  telephone: '+223 74 72 72 27',
  whatsapp: 'https://wa.me/22374727227',
  email: 'contact@grizzlycenter.com',
  // Bamako vit en UTC toute l'année (pas d'heure d'été) : l'heure UTC est l'heure locale.
  horaires: {
    1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18], // lundi → vendredi
    6: [9, 17], // samedi
    0: null, // dimanche fermé
  },
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const SERVICES = [
  ['Vente de lubrifiants', "huiles moteur, de boîte, graisses et fluides MOTOREX pour automobiles, motos, scooters et engins industriels"],
  ['Conseil technique', "recommandation du lubrifiant selon le véhicule, l'usage et les conditions de route"],
  ['Accessoires auto-moto', "accessoires, produits d'entretien, nettoyants et équipements de protection"],
  ['Vente en gros', 'approvisionnement pour garages, ateliers, flottes et revendeurs ; tarifs dégressifs et livraison disponible'],
  ['Coffee bar lounge', 'espace de détente avec salon aux fauteuils en fûts MOTOREX'],
  ['Formations & événements', "sessions d'information produits, événements moto et rencontres organisés au showroom"],
];

const GAMMES = [
  'Huiles moteur', 'Huiles boîte', 'Nettoyants', 'Liquide de frein', 'Antigel',
  'Sprays et graisses', 'Lubrifiants chaîne', 'Auto & SUV', 'Racing Line',
];

function ouvertMaintenant(date = new Date()) {
  const jour = date.getUTCDay();
  const heure = date.getUTCHours() + date.getUTCMinutes() / 60;
  const plage = BOUTIQUE.horaires[jour];
  if (!plage) return { ouvert: false, jour: JOURS[jour] };
  return { ouvert: heure >= plage[0] && heure < plage[1], jour: JOURS[jour], plage };
}

function texteBoutique() {
  const o = ouvertMaintenant();
  const etat = o.ouvert
    ? `Ouvert en ce moment (${o.jour}, jusqu'à ${o.plage[1]} h, heure de Bamako).`
    : `Fermé en ce moment (${o.jour}, heure de Bamako) selon les horaires affichés.`;
  return [
    `## ${BOUTIQUE.nom} — ${BOUTIQUE.role}`,
    `Adresse : ${BOUTIQUE.adresse}`,
    `Téléphone : ${BOUTIQUE.telephone}`,
    `WhatsApp : ${BOUTIQUE.whatsapp}`,
    `E-mail : ${BOUTIQUE.email}`,
    'Horaires : lundi à vendredi 08 h – 18 h ; samedi 09 h – 17 h ; dimanche fermé.',
    etat,
    '',
    `Page : ${SITE}/`,
  ].join('\n');
}

const OUTILS = [
  {
    name: 'boutique',
    description: 'Adresse, téléphone, WhatsApp, e-mail et horaires de Grizzly Center, et si la boutique est ouverte en ce moment (heure de Bamako).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'services',
    description: 'Les services proposés par Grizzly Center : vente de lubrifiants, conseil technique, accessoires, vente en gros, coffee bar, formations.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gamme',
    description: 'Les gammes MOTOREX présentées par Grizzly Center (huiles moteur, boîte, freins, antigel, chaîne…) et les usages couverts.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

function reponse(corps, init = {}) {
  const h = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  h.set('x-content-type-options', 'nosniff');
  return new Response(corps, { ...init, headers: h });
}

const json = (obj, status = 200) => reponse(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const texte = (t) => ({ content: [{ type: 'text', text: t }] });

async function mcp(request) {
  if (request.method === 'OPTIONS') return reponse(null, { status: 204 });
  if (request.method !== 'POST') {
    return reponse('POST attendu (JSON-RPC).', { status: 405, headers: { Allow: 'POST, OPTIONS', 'content-type': 'text/plain; charset=utf-8' } });
  }
  const corps = await request.json().catch(() => null);
  const repondre = (id, result) => json({ jsonrpc: '2.0', id, result });
  const echouer = (id, code, message) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return echouer(null, -32600, 'Corps JSON-RPC attendu.');
  const { id, method, params } = corps;
  if (id === undefined || id === null) return reponse(null, { status: 202 });

  if (method === 'initialize') {
    return repondre(id, {
      protocolVersion: VERSION_PROTOCOLE,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'grizzly-center', version: '1.0.0' },
      instructions: "Grizzly Center, distributeur officiel MOTOREX à Bamako. Les informations viennent de la page publique : "
        + "pour un prix, un stock ou une recommandation d'huile précise, renvoyez vers le téléphone ou WhatsApp de la boutique.",
    });
  }
  if (method === 'ping') return repondre(id, {});
  if (method === 'tools/list') return repondre(id, { tools: OUTILS });
  if (method !== 'tools/call') return echouer(id, -32601, `Méthode inconnue : ${String(method).slice(0, 40)}`);

  const nom = params && params.name;
  if (nom === 'boutique') return repondre(id, texte(texteBoutique()));
  if (nom === 'services') {
    return repondre(id, texte(SERVICES.map(([n, d]) => `- **${n}** — ${d}`).join('\n')
      + `\n\nContact : ${BOUTIQUE.telephone} · ${BOUTIQUE.whatsapp}`));
  }
  if (nom === 'gamme') {
    return repondre(id, texte(
      `Gammes MOTOREX présentées par Grizzly Center : ${GAMMES.join(', ')}.\n`
      + 'Usages couverts : automobiles, motos, scooters et engins industriels.\n'
      + "Pour la référence exacte d'huile d'un véhicule, le prix ou la disponibilité : "
      + `${BOUTIQUE.telephone} (WhatsApp ${BOUTIQUE.whatsapp}). Catalogue de la marque : https://www.motorex.com`,
    ));
  }
  return echouer(id, -32602, `Outil inconnu : ${String(nom).slice(0, 40)}`);
}

export default {
  async fetch(request) {
    const p = new URL(request.url).pathname;
    if (p === '/mcp') return mcp(request);
    if (p === '/.well-known/mcp.json') {
      return json({
        name: 'grizzly-center',
        description: 'Grizzly Center, distributeur officiel MOTOREX à Bamako — coordonnées, horaires, services et gamme, en lecture seule.',
        version: '1.0.0',
        protocolVersion: VERSION_PROTOCOLE,
        transport: { type: 'streamable-http', url: new URL('/mcp', request.url).toString() },
        capabilities: { tools: {} },
        tools: OUTILS.map((o) => ({ name: o.name, description: o.description })),
      });
    }
    if (p === '/robots.txt') {
      return reponse('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (p === '/') {
      return reponse(`Serveur MCP de Grizzly Center (lecture seule) : POST /mcp.\nLe site : ${SITE}/\n`, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return reponse('Introuvable.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};

export { ouvertMaintenant, OUTILS };
