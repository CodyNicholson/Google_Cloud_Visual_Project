import { firewall, loadBalancing, privateEgress, RULESETS, SOURCES, vpcPeering } from '../../lab/network.js';
import { doc } from '../../lab/lab.js';

const CATEGORY = 'Networking';

export default [
  {
    id: 'vpc-peering',
    category: CATEGORY,
    title: 'VPC networks and peering',
    tagline: 'A VPC spans the planet, but peering stops at one hop',
    description: [
      'A Google Cloud VPC network is global, unlike a VPC on AWS. Its subnets are regional, so a single network can have a subnet in Iowa and another in Belgium, and VMs in them can talk with no peering, gateway or VPN, given firewall rules that allow it.',
      'Tick which networks peer and read the reachability below. Peering joins two networks, and only those two: if a peers with b, and b with c, a still cannot reach c. Then try overlapping ranges: peering refuses them outright.',
      'Create custom mode networks and plan the IP ranges up front. Two auto mode networks can never peer, because their subnets all sit within 10.128.0.0/9. Peered networks share routes but not firewall rules, and internal DNS names do not resolve across. For many networks, use Network Connectivity Center or Shared VPC.',
    ],
    keyApis: ['--subnet-mode=custom', 'gcloud compute networks peerings create', 'Shared VPC', 'Network Connectivity Center', 'Private Service Connect'],
    useCases: ['Multi-region apps in one network', 'Connecting team networks', 'Hub and spoke designs'],
    snippet: { lang: 'bash', name: 'vpc.sh', code: `gcloud compute networks create vpc-a --subnet-mode=custom

# One network, subnets on two continents
gcloud compute networks subnets create a-us --network=vpc-a \\
  --region=us-central1 --range=10.1.0.0/20
gcloud compute networks subnets create a-eu --network=vpc-a \\
  --region=europe-west1 --range=10.1.16.0/20

# Peering must be created from both sides
gcloud compute networks peerings create a-to-b --network=vpc-a --peer-network=vpc-b
gcloud compute networks peerings create b-to-a --network=vpc-b --peer-network=vpc-a` },
    inputs: [
      { name: 'ab', label: 'Peer a ↔ b', type: 'checkbox', default: true },
      { name: 'bc', label: 'Peer b ↔ c', type: 'checkbox', default: true },
      { name: 'ac', label: 'Peer a ↔ c', type: 'checkbox', default: true },
    ],
    flow: [['gce', 'vpc', 'packet to 10.3.0.5'], ['vpc', 'vpc', 'look for a route'], ['vpc', 'gce', 'delivered, or dropped with no route']],
    actions: [
      { id: 'run', label: 'Test reachability', tone: 'accent', run: (i) => vpcPeering(i) },
      { id: 'transitive', label: 'Do it wrong: expect transitive routing', tone: 'ghost', run: (i) => vpcPeering(i, { ab: true, bc: true, ac: false, transitive: true }) },
      { id: 'overlap', label: 'Do it wrong: overlapping ranges', tone: 'ghost', run: (i) => vpcPeering(i, { ab: true, bc: false, ac: false, overlap: true }) },
    ],
    pitfalls: [
      { mistake: 'Assuming peering is transitive', symptom: 'b reaches both a and c, but a to c times out. Each peering shows ACTIVE.', why: '"VPC Network Peering does not provide transitive routing."', fix: 'Peer a and c directly, or use Network Connectivity Center.', avoid: 'Draw the network before you build it.', reproduce: 'transitive', source: doc('vpc/docs/vpc-peering', 'VPC Network Peering') },
      { mistake: 'Overlapping IP ranges', symptom: 'The peering is refused at creation with an error naming the overlapping subnet ranges.', why: 'Subnet ranges cannot match, contain or sit inside one another across peered networks.', fix: 'Re-address one network, often by rebuilding subnets.', avoid: 'Keep a central IP plan, and use custom mode. Two auto mode networks cannot peer.', reproduce: 'overlap', source: doc('vpc/docs/vpc-peering', 'VPC Network Peering') },
      { mistake: 'Expecting firewall rules to follow the peering', symptom: 'Routes exist but packets are dropped.', why: 'Peered networks remain separate: each one needs its own ingress allow rules, and cannot reference the other’s tags.', fix: 'Add allow rules for the peer’s IP ranges in the destination network.', avoid: 'Use Connectivity Tests in Network Intelligence Center to see what is blocking.', source: doc('vpc/docs/vpc-peering', 'VPC Network Peering') },
    ],
    visual: 'peering',
    test: { action: 'run' },
  },
  {
    id: 'firewall',
    category: CATEGORY,
    title: 'Firewall rules: priority wins',
    tagline: 'Lowest number first, first match decides, and everything else is denied',
    description: [
      'VPC firewall rules allow or deny traffic to VMs by source, port and target. Priorities run from 0 to 65535, lower numbers come first, and the default is 1000. At equal priority, deny beats allow. Rules are stateful: reply traffic for an allowed connection is allowed automatically.',
      'Choose a rule set and send a packet. Each rule lights up as it is checked, in priority order, and the CIDR matching here is real. If nothing matches, the implied rule denies ingress. Egress is allowed by default.',
      'The default network ships with rules that allow SSH and RDP from the whole internet (0.0.0.0/0) at priority 65534. Delete those. Reach VMs through IAP tunnelling (source range 35.235.240.0/20) instead. Also: outbound TCP port 25 to external addresses is blocked by default.',
    ],
    keyApis: ['--priority', '--source-ranges', '--target-tags', '--target-service-accounts', 'gcloud compute ssh --tunnel-through-iap'],
    useCases: ['Locking down VMs', 'Letting a load balancer reach backends', 'Debugging timeouts'],
    snippet: { lang: 'bash', name: 'firewall.sh', code: `# Google's load balancer and health check ranges only
gcloud compute firewall-rules create allow-lb-to-web \\
  --network=my-vpc --action=allow --rules=tcp:443 \\
  --source-ranges=130.211.0.0/22,35.191.0.0/16 --target-tags=web

# SSH only through Identity-Aware Proxy
gcloud compute firewall-rules create allow-iap-ssh \\
  --network=my-vpc --action=allow --rules=tcp:22 \\
  --source-ranges=35.235.240.0/20

gcloud compute ssh my-vm --tunnel-through-iap` },
    inputs: [
      { name: 'ruleset', label: 'Rule set', type: 'select', default: 'Least privilege (recommended)', options: Object.keys(RULESETS) },
      { name: 'source', label: 'Source', type: 'select', default: 'Google load balancer (130.211.0.5)', options: Object.keys(SOURCES) },
      { name: 'port', label: 'TCP port', type: 'select', default: '443', options: ['443', '22', '5432', '3389'] },
      { name: 'target', label: 'Target VM tag', type: 'select', default: 'web', options: ['web', 'db'] },
    ],
    flow: [['internet', 'vpc', 'TCP packet'], ['vpc', 'vpc', 'rules by priority'], ['vpc', 'gce', 'allowed: delivered']],
    actions: [
      { id: 'run', label: 'Send the packet', tone: 'accent', run: (i) => firewall(i) },
      { id: 'defaults', label: 'Do it wrong: SSH on the default network', tone: 'ghost', run: (i) => firewall(i, { ruleset: 'The default network', source: 'Internet (203.0.113.9)', port: 22, target: 'web' }) },
      { id: 'shadow', label: 'Do it wrong: a deny above your allow', tone: 'ghost', run: (i) => firewall(i, { ruleset: 'A deny that shadows an allow', source: 'Internet (203.0.113.9)', port: 443, target: 'web' }) },
    ],
    pitfalls: [
      { mistake: 'Leaving the default network’s rules in place', symptom: 'SSH is open to the world, and logs fill up with login attempts.', why: 'default-allow-ssh and default-allow-rdp accept 0.0.0.0/0.', fix: 'Delete them, and use IAP: gcloud compute ssh --tunnel-through-iap.', avoid: 'Delete the default network in new projects, or enforce constraints/compute.skipDefaultNetworkCreation.', reproduce: 'defaults', source: doc('firewall/docs/firewalls', 'VPC firewall rules') },
      { mistake: 'A broad deny with a lower number than your allow', symptom: 'Connection timed out, although the allow rule looks perfect.', why: 'The lower number wins, regardless of action.', fix: 'Renumber, or narrow the deny.', avoid: 'Use unique priorities with gaps, and test with Connectivity Tests.', reproduce: 'shadow', source: doc('firewall/docs/firewalls', 'VPC firewall rules') },
      { mistake: 'Blocking load balancer health checks', symptom: 'Every backend reports unhealthy and the load balancer returns errors, while the app itself works fine.', why: 'Health checks come from 130.211.0.0/22 and 35.191.0.0/16 and need their own allow rule.', fix: 'Add an allow rule for those ranges on the backend port.', avoid: 'Include it in your load balancer module.', source: doc('load-balancing/docs/health-check-concepts', 'Health checks overview') },
      { mistake: 'Target tags that match nothing', symptom: 'A rule exists, and traffic is still dropped.', why: 'A rule with --target-tags applies only to VMs that carry the tag, and tags are easy to misspell.', fix: 'Check the VM’s network tags, then add it.', avoid: 'Prefer target service accounts, which are harder to change by accident.', source: doc('firewall/docs/firewalls', 'VPC firewall rules') },
    ],
    visual: 'firewall',
    test: { action: 'run' },
  },
  {
    id: 'private-egress',
    category: CATEGORY,
    title: 'Private VMs: reaching out',
    tagline: 'No external IP means no way out, until you add one of two things',
    description: [
      'Good practice is to give VMs no external IP. But then they can only talk within the VPC. Two features fix different halves of that. Private Google Access lets them reach Google APIs, and is a per-subnet setting. Cloud NAT lets them reach the internet.',
      'Toggle the settings and see which destinations work. Red lanes hang until they time out: that is what the mistake looks like in practice, because the packets just go nowhere.',
      'Cloud NAT is regional and outbound only: it translates "established inbound response packets only", so nobody can start a connection to your VM. Cloud Run and Cloud Run functions are supported by it too.',
    ],
    keyApis: ['--no-address', '--enable-private-ip-google-access', 'gcloud compute routers nats create', 'Direct VPC egress', 'Private Service Connect'],
    useCases: ['Secure worker VMs', 'Private GKE nodes', 'A fixed outbound IP for partner allowlists'],
    snippet: { lang: 'bash', name: 'egress.sh', code: `# A VM with no external IP
gcloud compute instances create worker --subnet=my-subnet --no-address

# It can now reach Google APIs
gcloud compute networks subnets update my-subnet \\
  --region=us-central1 --enable-private-ip-google-access

# And the internet, outbound only
gcloud compute routers create nat-router --network=my-vpc --region=us-central1
gcloud compute routers nats create my-nat --router=nat-router --region=us-central1 \\
  --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges` },
    inputs: [
      { name: 'externalIp', label: 'VM has an external IP', type: 'checkbox', default: false },
      { name: 'pga', label: 'Private Google Access', type: 'checkbox', default: true },
      { name: 'nat', label: 'Cloud NAT', type: 'checkbox', default: true },
    ],
    flow: [['gce', 'vpc', 'packet out'], ['vpc', 'gcs', 'Private Google Access'], ['vpc', 'nat', 'internet-bound traffic'], ['nat', 'internet', 'translated source IP']],
    actions: [
      { id: 'run', label: 'Test each destination', tone: 'accent', run: (i) => privateEgress(i) },
      { id: 'none', label: 'Do it wrong: private VM, nothing else', tone: 'ghost', run: (i) => privateEgress(i, { cfg: { externalIp: false, pga: false, nat: false } }) },
    ],
    pitfalls: [
      { mistake: 'A private VM with no egress path', symptom: 'dial tcp REMOTE_HOST:REMOTE_PORT: i/o timeout, or apt-get and docker pull hang.', why: 'Without an external IP, Private Google Access or Cloud NAT, those VMs can only send traffic within the VPC network.', fix: 'Enable Private Google Access on the subnet, and add Cloud NAT for internet access.', avoid: 'Put both in your network module, and check connectivity at startup.', reproduce: 'none', source: doc('vpc/docs/private-google-access', 'Private Google Access') },
      { mistake: 'Enabling Private Google Access on the wrong subnet', symptom: 'One VM reaches storage.googleapis.com and an identical one times out.', why: 'It is a per-subnet setting, not per network or per VM.', fix: 'Enable it on the VM’s own subnet.', avoid: 'Set it on all subnets in IaC.', source: doc('vpc/docs/private-google-access', 'Private Google Access') },
      { mistake: 'Expecting NAT to allow inbound traffic', symptom: 'Partners cannot reach your VM through the NAT IP.', why: 'Cloud NAT handles responses to established connections only.', fix: 'Put a load balancer in front for inbound traffic.', avoid: 'Separate inbound (load balancer) and outbound (NAT) in your design.', source: doc('nat/docs/overview', 'Cloud NAT overview') },
    ],
    visual: 'egress',
    test: { action: 'run' },
  },
  {
    id: 'load-balancing',
    category: CATEGORY,
    title: 'Load balancers, Cloud Armor and CDN',
    tagline: 'One global IP, with attacks stopped at the edge',
    description: [
      'Cloud Load Balancing is several products. Choose by traffic: HTTP(S) takes an Application Load Balancer, TCP with optional TLS offload a proxy Network Load Balancer, anything else or a need to keep client IPs a passthrough Network Load Balancer. Then choose external or internal, global or regional.',
      'Set the traffic type to see which you need. Then six requests go through the edge. Cloud Armor rules run in priority order, then Cloud CDN answers what it has cached, and only the rest reach your backend.',
      'The global external Application Load Balancer gives one anycast IP worldwide. A Cloud Run service behind it also needs its ingress restricted, otherwise the default run.app URL remains a way around your edge security. Test Cloud Armor rules in preview mode first.',
    ],
    keyApis: ['forwarding-rules', 'backend-services', 'serverless NEG', 'security-policies', '--enable-cdn', '--ingress=internal-and-cloud-load-balancing'],
    useCases: ['Global web apps', 'WAF and DDoS protection', 'Custom domains and managed certificates'],
    snippet: { lang: 'bash', name: 'edge.sh', code: `# A Cloud Armor policy using a preconfigured WAF rule
gcloud compute security-policies create edge-policy
gcloud compute security-policies rules create 1000 --security-policy=edge-policy \\
  --expression="evaluatePreconfiguredWaf('sqli-v33-stable')" --action=deny-403 --preview

# Attach it, with CDN, to the backend
gcloud compute backend-services update web --global \\
  --security-policy=edge-policy --enable-cdn

# Make Cloud Run reachable only through the load balancer
gcloud run services update web --ingress=internal-and-cloud-load-balancing` },
    inputs: [
      { name: 'protocol', label: 'Traffic', type: 'select', default: 'HTTP or HTTPS', options: ['HTTP or HTTPS', 'TCP, optional TLS offload', 'TCP or UDP, keep the client IP'] },
      { name: 'clients', label: 'Clients', type: 'select', default: 'Internet', options: ['Internet', 'Internal (same VPC or VPN)'] },
      { name: 'scope', label: 'Scope', type: 'select', default: 'Global (backends in many regions)', options: ['Global (backends in many regions)', 'One region'] },
    ],
    flow: [['internet', 'lb', 'anycast IP'], ['lb', 'lb', 'Cloud Armor, then Cloud CDN'], ['lb', 'run', 'cache miss: to a backend'], ['run', 'internet', 'response, cached at the edge']],
    actions: [
      { id: 'run', label: 'Choose and send traffic', tone: 'accent', run: (i) => loadBalancing(i) },
      { id: 'direct', label: 'Do it wrong: leave the run.app URL open', tone: 'ghost', run: (i) => loadBalancing(i, { direct: true }), flow: () => [['internet', 'run', 'straight to the run.app URL'], ['run', 'internet', 'no WAF, no CDN']] },
    ],
    pitfalls: [
      { mistake: 'Leaving the backend reachable directly', symptom: 'WAF logs look clean while attacks arrive at your app.', why: 'Cloud Armor enforces at the edge only for traffic that passes through the load balancer.', fix: 'Set Cloud Run ingress to internal-and-cloud-load-balancing, or restrict VMs by firewall to Google’s ranges.', avoid: 'Disable the default run.app URL if nothing uses it.', reproduce: 'direct', source: doc('run/docs/securing/ingress', 'Restrict ingress for Cloud Run') },
      { mistake: 'Enabling WAF rules straight to blocking', symptom: 'Real users start to get 403s.', why: 'Preconfigured rules can have false positives. Only the first 64 kB of a body is inspected, too.', fix: 'Move the rule to --preview, read the logs, and tune it.', avoid: 'Always start new rules in preview mode.', source: doc('armor/docs/security-policy-overview', 'Security policy overview') },
      { mistake: 'A managed certificate stuck provisioning', symptom: 'Waiting for certificate provisioning. You must configure your DNS records for certificate issuance to begin.', why: 'DNS records do not match, or the domain is unverified.', fix: 'Fix the DNS record and wait, up to 24 hours.', avoid: 'Point DNS first, and plan for the wait before launch day.', source: doc('run/docs/troubleshooting', 'Cloud Run troubleshooting') },
    ],
    visual: 'edge',
    test: { action: 'run' },
  },
];
