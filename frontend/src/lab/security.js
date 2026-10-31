// Security: Secret Manager versions and rollouts, and the guardrails that sit above IAM.
import { Demo, bool, clampInt, oneOf, walkGates } from './lab.js';

export const SECRET_START_ERROR = 'The request failed because the instance could not start successfully.';

export function secretManager(inputs, opts = {}) {
  const d = new Demo('secret-manager');
  const ref = oneOf(opts.ref || inputs.ref, ['Pinned version (:3)', 'latest']);
  const badRotation = opts.badRotation ?? bool(inputs.badRotation);
  const roleGranted = opts.roleGranted ?? bool(inputs.roleGranted);
  const pinned = ref.startsWith('Pinned');
  d.cmd(`gcloud run deploy api --set-secrets=DB_PASSWORD=db-password:${pinned ? '3' : 'latest'}`);
  if (roleGranted) d.cmd('gcloud secrets add-iam-policy-binding db-password --member=serviceAccount:api@my-lab.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor');
  const versions = [{ n: 1, state: 'destroyed' }, { n: 2, state: 'disabled' }, { n: 3, state: 'enabled', good: true }];
  if (badRotation) {
    d.cmd('printf wrong-value | gcloud secrets versions add db-password --data-file=-');
    versions.push({ n: 4, state: 'enabled', good: false });
  }
  const resolved = pinned ? 3 : versions[versions.length - 1].n;
  const value = versions.find((v) => v.n === resolved);
  // Env vars are read at instance start: existing instances keep the value, new ones read the new one.
  const instances = [
    { name: 'instance-1', started: 'before rotation', version: 3, ok: roleGranted },
    { name: 'instance-2', started: 'before rotation', version: 3, ok: roleGranted },
    { name: 'instance-3', started: 'after rotation', version: resolved, ok: roleGranted && value.good },
    { name: 'instance-4', started: 'after rotation', version: resolved, ok: roleGranted && value.good },
  ];
  let error = null;
  if (!roleGranted) {
    error = `Permission 'secretmanager.versions.access' denied for resource 'projects/my-lab/secrets/db-password/versions/${resolved}' (or it may not exist). ${SECRET_START_ERROR}`;
    d.cmd(`✗ ${error}`);
  } else if (!value.good) {
    error = 'FATAL: password authentication failed for user "app"';
    d.cmd(`Scaling up: new instances read version ${resolved}`);
    d.cmd(`✗ ${error}`);
  } else d.cmd(`Instances read version ${resolved}`);
  if (opts.roleGranted === false) {
    d.check('Without Secret Accessor the instance cannot start', instances.every((i) => !i.ok), 'a very common first-deploy failure');
    d.cmd('# Fix: grant roles/secretmanager.secretAccessor to the runtime service account, on this secret');
  } else if (opts.ref === 'latest') {
    d.check('latest silently rolls a bad version to new instances only', instances.slice(0, 2).every((i) => i.ok) && instances.slice(2).every((i) => !i.ok), 'old instances work, new ones fail: a confusing partial outage');
    d.cmd('# Fix: gcloud secrets versions disable 4; pin versions and roll out through a normal deploy');
    const pin = versions.find((v) => v.n === 3);
    d.check('A pinned reference is unaffected by the bad version', pin.good, 'it changes only through a deploy, which you can roll back');
  } else {
    d.check('The reference resolves to the expected version', resolved === (pinned ? 3 : versions.length), `version ${resolved}`);
    d.check('Instance health follows the role and the value', instances.every((i) => i.ok === (roleGranted && versions.find((v) => v.n === i.version).good)), `${instances.filter((i) => i.ok).length} of 4 healthy`);
  }
  return d.result({ ref, versions, resolved, instances, error, roleGranted });
}

// ---- Guardrails above IAM -------------------------------------------------------------------

const ACTIONS = {
  'Read a bucket from outside the perimeter': { vpcsc: true, org: false, deny: false },
  'Create a service account key': { vpcsc: false, org: true, deny: false, error: 'FAILED_PRECONDITION: Key creation is not allowed on this service account.' },
  'Delete a production bucket': { vpcsc: false, org: false, deny: true },
};

export function guardrails(inputs, opts = {}) {
  const d = new Demo('guardrails');
  const action = oneOf(opts.action || inputs.action, Object.keys(ACTIONS));
  const a = ACTIONS[action];
  const iam = bool(inputs.iam);
  const orgPolicy = opts.orgPolicy ?? bool(inputs.orgPolicy);
  const perimeter = opts.perimeter ?? bool(inputs.perimeter);
  const denyPolicy = opts.denyPolicy ?? bool(inputs.denyPolicy);
  const { gates, failed, ok } = walkGates([
    { id: 'vpcsc', label: 'VPC Service Controls', note: 'Is the request inside the perimeter?', open: !(a.vpcsc && perimeter), error: 'AccessDeniedException: 403 Request violates VPC Service Controls.' },
    { id: 'org', label: 'Organization Policy', note: 'Is this kind of resource or configuration allowed?', open: !(a.org && orgPolicy), error: a.error },
    { id: 'deny', label: 'IAM deny', note: 'Does a deny rule name this permission?', open: !(a.deny && denyPolicy), error: "PERMISSION_DENIED: Permission 'storage.buckets.delete' denied by a deny policy" },
    { id: 'allow', label: 'IAM allow', note: 'Does a role grant this permission?', open: iam, error: "PERMISSION_DENIED: The caller does not have permission" },
  ]);
  d.cmd(`Caller holds roles/owner: ${iam}`);
  d.cmd(`Action: ${action}`);
  if (failed) d.cmd(`✗ ${failed.error}`); else d.cmd('Request allowed');
  d.check('The request stops at the first closed guardrail', gates.findIndex((g) => g.status === 'fail') === gates.findIndex((g) => !g.open), failed ? failed.label : 'none');
  if (opts.action) {
    d.check('Being Owner does not bypass the guardrail', iam && !ok, failed?.label);
    d.cmd('# Fix: work out which layer refused from the error, then change that layer (or the request), not IAM');
    d.check('Each layer has its own distinctive error', Boolean(failed?.error), failed?.error);
  } else {
    d.check('IAM is only the last question asked', gates[gates.length - 1].id === 'allow', 'guardrails come first');
  }
  return d.result({ action, gates, ok, error: failed?.error, count: clampInt(gates.filter((g) => g.status === 'pass').length, 0, 4, 0) });
}
