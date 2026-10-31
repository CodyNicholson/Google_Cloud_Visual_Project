// Networking: global VPCs and peering, firewall rule evaluation, private egress, and load balancers.
import { Demo, GcpError, bool, oneOf } from './lab.js';

// ---- VPC and peering ------------------------------------------------------------------------

export function vpcPeering(inputs, opts = {}) {
  const d = new Demo('vpc-peering');
  const ab = opts.ab ?? bool(inputs.ab);
  const bc = opts.bc ?? bool(inputs.bc);
  const ac = opts.ac ?? bool(inputs.ac);
  const overlap = opts.overlap ?? false;
  const nets = [
    { id: 'a', name: 'vpc-a', subnets: ['10.1.0.0/20 us-central1', '10.1.16.0/20 europe-west1'] },
    { id: 'b', name: 'vpc-b (hub)', subnets: [overlap ? '10.1.0.0/20 us-central1' : '10.2.0.0/20 us-central1'] },
    { id: 'c', name: 'vpc-c', subnets: ['10.3.0.0/20 asia-east1'] },
  ];
  d.cmd('gcloud compute networks create vpc-a --subnet-mode=custom');
  d.cmd('gcloud compute networks subnets create a-us --network=vpc-a --region=us-central1 --range=10.1.0.0/20');
  d.cmd('gcloud compute networks subnets create a-eu --network=vpc-a --region=europe-west1 --range=10.1.16.0/20');
  const peer = (x, y) => `gcloud compute networks peerings create ${x}-${y} --network=vpc-${x} --peer-network=vpc-${y}`;
  let peeringError = null;
  const links = [];
  if (ab) {
    d.cmd(peer('a', 'b'));
    const r = d.attempt('Activating the a-b peering', () => {
      if (overlap) throw new GcpError('Invalid peering', 'the two networks have overlapping subnet ranges (10.1.0.0/20)');
    });
    if (r.ok) links.push(['a', 'b']); else peeringError = `${r.error.name}: ${r.error.message}`;
  }
  if (bc) { d.cmd(peer('b', 'c')); links.push(['b', 'c']); }
  if (ac) { d.cmd(peer('a', 'c')); links.push(['a', 'c']); }
  const direct = (x, y) => links.some(([p, q]) => (p === x && q === y) || (p === y && q === x));
  const reach = [['a', 'b'], ['b', 'c'], ['a', 'c']].map(([x, y]) => ({ from: x, to: y, ok: direct(x, y) }));
  d.cmd(`ping from vpc-a to vpc-c: ${direct('a', 'c') ? 'replies' : '✗ 100% packet loss (no route)'}`);
  d.check('Only directly peered networks can talk', reach.every((r) => r.ok === direct(r.from, r.to)), reach.map((r) => `${r.from}↔${r.to} ${r.ok ? 'yes' : 'no'}`).join(', '));
  if (opts.transitive) {
    d.check('Peering is not transitive: a↔b and b↔c does not give a↔c', direct('a', 'b') && direct('b', 'c') && !direct('a', 'c'), 'b will not forward traffic between its peers');
    d.cmd('# Fix: peer a and c directly, or use Network Connectivity Center or Shared VPC');
  }
  if (overlap) {
    d.check('Overlapping ranges refuse the peering', Boolean(peeringError), 'Google Cloud checks for overlaps when the peering is created');
    d.cmd('# Fix: plan non-overlapping ranges up front; custom mode networks, not auto mode');
  }
  d.check('A single VPC spans regions with no peering', nets[0].subnets.length === 2, 'vpc-a has subnets on two continents and they reach each other by default');
  return d.result({ nets, links, reach, error: peeringError, transitive: !!opts.transitive });
}

// ---- Firewall evaluation --------------------------------------------------------------------

const ipToInt = (ip) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
export function inCidr(ip, cidr) {
  const [base, bits] = cidr.split('/');
  const size = 2 ** (32 - Number(bits));
  const start = ipToInt(base) - (ipToInt(base) % size);
  return ipToInt(ip) >= start && ipToInt(ip) < start + size;
}

export const RULESETS = {
  'Least privilege (recommended)': [
    { name: 'allow-lb-to-web', priority: 1000, action: 'allow', src: ['130.211.0.0/22', '35.191.0.0/16'], ports: [443], target: 'web' },
    { name: 'allow-iap-ssh', priority: 1000, action: 'allow', src: ['35.235.240.0/20'], ports: [22], target: 'any' },
    { name: 'allow-web-to-db', priority: 1100, action: 'allow', src: ['10.128.0.0/20'], ports: [5432], target: 'db' },
  ],
  'The default network': [
    { name: 'default-allow-internal', priority: 65534, action: 'allow', src: ['10.128.0.0/9'], ports: 'all', target: 'any' },
    { name: 'default-allow-ssh', priority: 65534, action: 'allow', src: ['0.0.0.0/0'], ports: [22], target: 'any' },
    { name: 'default-allow-rdp', priority: 65534, action: 'allow', src: ['0.0.0.0/0'], ports: [3389], target: 'any' },
    { name: 'default-allow-icmp', priority: 65534, action: 'allow', src: ['0.0.0.0/0'], ports: [], target: 'any' },
  ],
  'A deny that shadows an allow': [
    { name: 'deny-all-https', priority: 900, action: 'deny', src: ['0.0.0.0/0'], ports: [443], target: 'any' },
    { name: 'allow-https', priority: 1000, action: 'allow', src: ['0.0.0.0/0'], ports: [443], target: 'web' },
  ],
};
export const SOURCES = { 'Internet (203.0.113.9)': '203.0.113.9', 'Google load balancer (130.211.0.5)': '130.211.0.5', 'IAP tunnel (35.235.240.8)': '35.235.240.8', 'Web VM (10.128.0.5)': '10.128.0.5' };
const TARGETS = ['web', 'db'];
const PORTS = ['443', '22', '5432', '3389'];

export function evaluateFirewall(rules, { src, port, target }) {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || (a.action === 'deny' ? -1 : 1));
  const trace = [];
  for (const rule of sorted) {
    const targetOk = rule.target === 'any' || rule.target === target;
    const srcOk = rule.src.some((c) => inCidr(src, c));
    const portOk = rule.ports === 'all' || rule.ports.includes(port);
    const match = targetOk && srcOk && portOk;
    trace.push({ ...rule, match, why: !targetOk ? `target tag is ${rule.target}` : !srcOk ? 'source not in range' : !portOk ? 'port not listed' : `${rule.action} wins` });
    if (match) return { allowed: rule.action === 'allow', winner: rule.name, trace };
  }
  trace.push({ name: 'implied-deny-ingress', priority: 65535, action: 'deny', src: ['0.0.0.0/0'], ports: 'all', target: 'any', match: true, why: 'nothing matched: the implied rule denies' });
  return { allowed: false, winner: 'implied-deny-ingress', trace };
}

export function firewall(inputs, opts = {}) {
  const d = new Demo('firewall');
  const ruleset = oneOf(opts.ruleset || inputs.ruleset, Object.keys(RULESETS));
  const source = oneOf(opts.source || inputs.source, Object.keys(SOURCES));
  const port = Number(oneOf(String(opts.port || inputs.port), PORTS));
  const target = oneOf(opts.target || inputs.target, TARGETS);
  const rules = RULESETS[ruleset];
  rules.forEach((r) => d.cmd(`gcloud compute firewall-rules create ${r.name} --priority=${r.priority} --action=${r.action} --source-ranges=${r.src.join(',')}${r.ports === 'all' ? '' : ` --rules=tcp:${r.ports.join(',')}`}${r.target === 'any' ? '' : ` --target-tags=${r.target}`}`));
  d.cmd(`Packet: ${source} → VM tagged "${target}" on TCP ${port}`);
  const out = evaluateFirewall(rules, { src: SOURCES[source], port, target });
  d.cmd(`${out.allowed ? 'ALLOWED' : '✗ DENIED'} by ${out.winner}`);
  const priorities = out.trace.map((t) => t.priority);
  d.check('Rules are read lowest priority number first', priorities.every((p, i) => i === 0 || priorities[i - 1] <= p), priorities.join(' → '));
  d.check('The first match decides', out.trace.filter((t) => t.match).length === 1, out.winner);
  if (opts.ruleset === 'The default network') {
    d.check('The default network opens SSH to the entire internet', out.allowed && out.winner === 'default-allow-ssh', 'scanners find port 22 within minutes');
    const fixed = evaluateFirewall(RULESETS['Least privilege (recommended)'], { src: SOURCES[source], port, target });
    d.cmd('# Fix: delete default-allow-ssh and use IAP (35.235.240.0/20): gcloud compute ssh vm --tunnel-through-iap');
    d.check('With IAP-only SSH the same packet is dropped', !fixed.allowed, fixed.winner);
  }
  if (opts.ruleset === 'A deny that shadows an allow') {
    d.check('A lower number beats a later allow', !out.allowed && out.winner === 'deny-all-https', 'priority 900 runs before priority 1000');
  }
  if (!out.trace.some((t) => t.match && t.name !== 'implied-deny-ingress') ) d.check('Unmatched ingress is denied by the implied rule', !out.allowed, 'priority 65535');
  return d.result({ ruleset, source, port, target, ...out });
}

// ---- Private egress -------------------------------------------------------------------------

export const DESTINATIONS = ['storage.googleapis.com', 'api.github.com (internet)', '10.128.0.9 (same VPC)'];

export function route({ externalIp, pga, nat }, destination) {
  if (destination.startsWith('10.')) return { ok: true, via: 'VPC routing' };
  if (externalIp) return { ok: true, via: 'the VM’s external IP' };
  if (destination.startsWith('storage')) {
    if (pga) return { ok: true, via: 'Private Google Access' };
    if (nat) return { ok: true, via: 'Cloud NAT' };
    return { ok: false, via: 'no route' };
  }
  return nat ? { ok: true, via: 'Cloud NAT' } : { ok: false, via: 'no route' };
}

/** Cloud NAT translates replies to connections the VM started, never a connection from outside. */
export const inboundThroughNat = ({ established }) => established;

export function privateEgress(inputs, opts = {}) {
  const d = new Demo('private-egress');
  const cfg = opts.cfg || { externalIp: bool(inputs.externalIp), pga: bool(inputs.pga), nat: bool(inputs.nat) };
  d.cmd(`gcloud compute instances create worker ${cfg.externalIp ? '' : '--no-address'}`.trim());
  if (cfg.pga) d.cmd('gcloud compute networks subnets update my-subnet --region=us-central1 --enable-private-ip-google-access');
  if (cfg.nat) {
    d.cmd('gcloud compute routers create nat-router --network=my-vpc --region=us-central1');
    d.cmd('gcloud compute routers nats create my-nat --router=nat-router --region=us-central1 --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges');
  }
  const routes = DESTINATIONS.map((destination) => ({ destination, ...route(cfg, destination) }));
  routes.forEach((r) => d.cmd(r.ok ? `curl ${r.destination} → OK via ${r.via}` : `✗ curl ${r.destination} → dial tcp: i/o timeout`));
  d.check('Traffic inside the VPC always routes', routes[2].ok, 'no NAT needed for internal addresses');
  d.check('Cloud NAT is outbound only', inboundThroughNat({ established: true }) && !inboundThroughNat({ established: false }), 'responses return, unsolicited inbound connections do not');
  if (opts.cfg) {
    d.check('An internal-only VM with neither feature reaches nothing outside', !routes[0].ok && !routes[1].ok, 'requests hang until they time out, with no clear error');
    const fixed = DESTINATIONS.map((x) => route({ ...cfg, pga: true, nat: true }, x));
    d.cmd('# Fix: enable Private Google Access on the subnet and add Cloud NAT in the region');
    d.check('With both enabled every destination works', fixed.every((r) => r.ok), fixed.map((r) => r.via).join(', '));
  }
  return d.result({ cfg, routes });
}

// ---- Load balancing and the edge ------------------------------------------------------------

const LB_PROTOCOL = ['HTTP or HTTPS', 'TCP, optional TLS offload', 'TCP or UDP, keep the client IP'];
const LB_CLIENTS = ['Internet', 'Internal (same VPC or VPN)'];
const LB_SCOPE = ['Global (backends in many regions)', 'One region'];

export function pickLoadBalancer({ protocol, clients, scope }) {
  const family = protocol.startsWith('HTTP') ? 'Application Load Balancer' : protocol.startsWith('TCP, opt') ? 'Proxy Network Load Balancer' : 'Passthrough Network Load Balancer';
  const place = clients === 'Internet' ? 'external' : 'internal';
  const reach = scope.startsWith('Global') ? (place === 'internal' ? 'cross-region' : 'global') : 'regional';
  return `${reach[0].toUpperCase()}${reach.slice(1)} ${place} ${family}`;
}

export const EDGE_REQUESTS = [
  { path: 'GET /assets/logo.png', kind: 'static' },
  { path: 'GET /assets/logo.png', kind: 'static' },
  { path: "GET /search?q=' OR 1=1 --", kind: 'sqli' },
  { path: 'GET /api/orders', kind: 'api' },
  { path: 'POST /api/orders from a banned country', kind: 'geo' },
  { path: 'GET /api/orders', kind: 'api' },
];

export function runEdge(requests, { direct = false } = {}) {
  const cache = new Set();
  return requests.map((r, i) => {
    if (direct) return { ...r, i, armor: 'not evaluated', cdn: 'not evaluated', backend: true, outcome: r.kind === 'sqli' || r.kind === 'geo' ? 'reached the backend' : 'served by the backend' };
    if (r.kind === 'sqli') return { ...r, i, armor: 'blocked by rule 1000 (sqli-v33-stable)', cdn: '-', backend: false, outcome: '403 at the edge' };
    if (r.kind === 'geo') return { ...r, i, armor: 'blocked by rule 2000 (origin.region_code)', cdn: '-', backend: false, outcome: '403 at the edge' };
    if (r.kind === 'static' && cache.has(r.path)) return { ...r, i, armor: 'allow', cdn: 'HIT', backend: false, outcome: 'served from cache' };
    if (r.kind === 'static') cache.add(r.path);
    return { ...r, i, armor: 'allow', cdn: r.kind === 'static' ? 'MISS' : 'bypass', backend: true, outcome: 'served by the backend' };
  });
}

export function loadBalancing(inputs, opts = {}) {
  const d = new Demo('load-balancing');
  const protocol = oneOf(inputs.protocol, LB_PROTOCOL);
  const clients = oneOf(inputs.clients, LB_CLIENTS);
  const scope = oneOf(inputs.scope, LB_SCOPE);
  const pick = pickLoadBalancer({ protocol, clients, scope });
  d.cmd(`Traffic: ${protocol}; clients: ${clients}; scope: ${scope}`);
  d.cmd(`Choose: ${pick}`);
  d.cmd('gcloud compute forwarding-rules create web --global --target-https-proxy=web-proxy --ports=443');
  d.cmd('gcloud compute backend-services update web --global --security-policy=edge-policy --enable-cdn');
  const results = runEdge(EDGE_REQUESTS, { direct: opts.direct });
  results.forEach((r) => d.cmd(`${r.path} → ${r.outcome}`));
  const hitsBackend = results.filter((r) => r.backend).length;
  d.check('The right family matches the traffic', pick.includes(protocol.startsWith('HTTP') ? 'Application' : protocol.startsWith('TCP, opt') ? 'Proxy' : 'Passthrough'), pick);
  if (opts.direct) {
    d.check('Calling the service URL directly skips Cloud Armor', results.filter((r) => r.kind === 'sqli' || r.kind === 'geo').every((r) => r.backend), 'the SQL injection attempt reached the backend');
    d.cmd('# Fix: gcloud run services update web --ingress=internal-and-cloud-load-balancing');
    const fixed = runEdge(EDGE_REQUESTS);
    d.check('Restricting ingress forces traffic through the edge', fixed.filter((r) => r.kind === 'sqli' || r.kind === 'geo').every((r) => !r.backend), 'attacks stop at the edge');
  } else {
    d.check('Cloud Armor stops attacks before the backend', results.filter((r) => r.kind === 'sqli' || r.kind === 'geo').every((r) => !r.backend), '2 blocked at the edge');
    d.check('Cloud CDN serves the repeat request', results[1].cdn === 'HIT', `the backend handled ${hitsBackend} of ${results.length}`);
  }
  return d.result({ pick, protocol, clients, scope, results, hitsBackend, direct: !!opts.direct });
}
