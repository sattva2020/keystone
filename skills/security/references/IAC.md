<!-- original Keystone file (MIT) -->

# Infrastructure as code (category `iac`)

Scope: `Dockerfile*`, `docker-compose*.yml` that ship to production, Kubernetes manifests and Helm charts (`values*.yaml`, templates),
Terraform (`*.tf`), CloudFormation / SAM templates. Refs: A02:2025, A01:2025, A05:2025 (see `MAPPING.md`).
**Threat model:** an external attacker who reaches a workload (through an app bug, SSRF, a poisoned image) and tries to break out
of it or reach cloud credentials. Severity is by that reach — a misconfiguration with no workload the attacker can reach is a
hardening suggestion, not a finding (`SEVERITY.md`).

## Dockerfile
| Check | Unsafe | Safe | Severity |
|---|---|---|---|
| Runs as root | no `USER`, or `USER root` in the final stage | `USER 10001` (non-root) in the final stage | medium |
| Secrets in the image | `ENV API_KEY=…`, `ARG TOKEN` used in `RUN`, `COPY .env` | build secrets (`RUN --mount=type=secret`), runtime env | high |
| Remote `ADD` | `ADD https://…/tool.tar.gz /` | `COPY` local files; download with a checksum check | medium |
| Base image by tag | `FROM node:20` | `FROM node:20@sha256:…` | medium [no-image-digest] |
| Download and run | `RUN curl … \| sh` | pinned package, checksum verified | high |
| Build tools in the final image | single stage with compilers, package manager, shell left in | multi-stage build, minimal / distroless final stage | hardening |

## Kubernetes / Helm
| Check | Unsafe | Safe | Severity |
|---|---|---|---|
| Privileged container (CWE-250) | `securityContext.privileged: true` | not set | critical |
| Host access | `hostPID`, `hostNetwork`, `hostIPC: true`; `hostPath` of `/`, `/var/run/docker.sock`, `/etc`, `/proc` | no host namespaces; `emptyDir` / PVC | critical (docker.sock, `/`) · high (others) |
| Privilege escalation | `allowPrivilegeEscalation` not `false`; capabilities without `drop: ["ALL"]`; `add: ["SYS_ADMIN"]`, `NET_ADMIN`, `SYS_PTRACE` | `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]` | high |
| Pod hardening | no `runAsNonRoot: true`, no `readOnlyRootFilesystem: true`, no `seccompProfile.type: RuntimeDefault` | all three set | medium |
| Service-account token | `automountServiceAccountToken` not `false` on a pod that never calls the Kubernetes API | `automountServiceAccountToken: false` | medium |
| RBAC (CWE-269) | `"*"` in `verbs` or `resources`; `escalate`, `bind`, `impersonate`; read on `secrets` cluster-wide; a `ClusterRoleBinding` to `cluster-admin` for an app service account | named verbs and resources, namespaced `Role` | high |
| Image by tag | `image: app:1.4` or `:latest` | `image: app@sha256:…` | medium [no-image-digest] |
| Secrets in values | passwords or keys in `values.yaml` or a committed `Secret` manifest | external secret store, sealed secrets | rated as Secrets (`CHECKLIST.md`) |

## Terraform / CloudFormation
| Check | Unsafe | Safe | Severity |
|---|---|---|---|
| Public storage | bucket ACL `public-read` / `public-read-write`, no public access block, a bucket policy with `Principal: "*"` | private bucket, public access block on | high when the bucket can hold user or internal data |
| Open admin ports | security group / firewall `0.0.0.0/0` or `::/0` on 22, 3389, database or cache ports | a VPN or bastion range | high |
| Instance metadata v1 | `metadata_options { http_tokens = "optional" }` (or not set on older providers) on an instance with an IAM role | `http_tokens = "required"` | high when the workload can make server-side requests (SSRF → role credentials) · medium otherwise |
| Wildcard IAM (CWE-284) | `Action: "*"` or `Resource: "*"` on a workload role | named actions on named resources | high |
| Unencrypted data at rest | database, volume, bucket or queue without encryption | provider encryption on, KMS key where required | medium |
| Defaults left on (CWE-1188) | default VPC / default credentials / logging off for an internet-facing service | explicit settings | hardening unless a traced path exists |

## Not a finding
`docker-compose.yml` used only for local development; manifests under `dev/`, `examples/`, `test/`, kind / minikube configs; a
`privileged` CI runner image that never runs untrusted code; values that are `${VAR}` / external-secret references. A finding needs
the file that actually deploys (CI step, Helm release, Terraform root module) — say which one in `Entry point:`.

## Starters
`grep -rnE "^\s*USER|^\s*ADD https?://|^\s*FROM [^@]+$|ENV .*(KEY|TOKEN|SECRET|PASSWORD)=" --include="Dockerfile*" .`,
`grep -rnE "privileged:\s*true|host(PID|Network|IPC):\s*true|hostPath:|allowPrivilegeEscalation:\s*true|SYS_ADMIN|docker\.sock" --include="*.yaml" --include="*.yml" .`,
`grep -rnE "verbs:.*\*|resources:.*\*|escalate|impersonate|cluster-admin|automountServiceAccountToken" --include="*.yaml" --include="*.yml" .`,
`grep -rnE "public-read|0\.0\.0\.0/0|::/0|http_tokens|\"Action\":\s*\"\*\"|Action\s*=\s*\"\*\"" --include="*.tf" --include="*.json" --include="*.yaml" .`.
