# Deploying the site to S3 + CloudFront

**Nothing here was deployed or validated against AWS.** The workflow, the policies and the commands below were written from the CaptureIQ frontend pattern and the AWS documentation, but no AWS command was run and the workflow has never run. Expect to fix small things on the first deploy.

```
push to branch "sandbox" -> GitHub Actions (OIDC) -> npm ci, test, build -> S3 (private bucket) -> CloudFront (OAC) -> theshardsgame.com
```

The site is a React single-page app (Vite). The API is a separate service (`VITE_API_BASE`); the browser talks to it directly, so the API must allow the site's origin in its CORS settings.

## 1. AWS resources (the owner creates them)

1. **S3 bucket**, private, "Block all public access" on, no static website hosting. Example name `shards-landing-sandbox`.
2. **ACM certificate** for `theshardsgame.com` (and `www.theshardsgame.com` if wanted), requested in **us-east-1** (CloudFront only reads certificates there), validated through DNS.
3. **Origin Access Control** (signing: sigv4, always, origin type S3).
4. **Response headers policy** (section 2).
5. **CloudFront distribution**:
   - origin: the bucket's regional domain name, using the OAC (not the S3 website endpoint);
   - default root object `index.html`;
   - viewer protocol policy: redirect HTTP to HTTPS; methods GET and HEAD; compression on;
   - cache policy: CachingOptimized (the deploy sets `Cache-Control` on each object: a year for hashed files, a day for fonts and images, `no-cache` for `index.html`);
   - response headers policy: the one from section 2;
   - alternate domain names (aliases): `theshardsgame.com` (and `www.` if used), with the ACM certificate;
   - **custom error responses for the single-page app: 403 -> `/index.html` with response code 200, and 404 -> `/index.html` with response code 200**, error caching minimum TTL 0. (With OAC and no `s3:ListBucket` permission for CloudFront, S3 answers 403 for a missing key, which is why 403 must be covered. This is what makes `/fairness`, `/login`, `/download` and a refresh on any of them work.)
6. **Bucket policy** so only this distribution reads the bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontRead",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/*",
      "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>" } }
    }
  ]
}
```

## 2. Response headers policy (security headers)

CloudFront sends these on every response (create the policy in the console, or with `aws cloudfront create-response-headers-policy`; "Origin override" on for each). The built `index.html` also carries the same policy in a `<meta>` tag, but a `<meta>` cannot set `frame-ancestors`, so the real header is what blocks framing.

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' https://api.sandbox.theshardsgame.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (add `; preload` only when the domain is ready to be preloaded) |
| `X-Frame-Options` | `DENY` |

If `VITE_API_BASE` is changed, change the host in `connect-src` here too (the meta tag follows the build automatically; `npm test` checks that).

As a policy config file:

```json
{
  "Name": "shards-landing-security-headers",
  "SecurityHeadersConfig": {
    "ContentSecurityPolicy": {
      "Override": true,
      "ContentSecurityPolicy": "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' https://api.sandbox.theshardsgame.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    },
    "ContentTypeOptions": { "Override": true },
    "FrameOptions": { "Override": true, "FrameOption": "DENY" },
    "ReferrerPolicy": { "Override": true, "ReferrerPolicy": "strict-origin-when-cross-origin" },
    "StrictTransportSecurity": { "Override": true, "AccessControlMaxAgeSec": 31536000, "IncludeSubdomains": true, "Preload": false }
  }
}
```

```powershell
aws cloudfront create-response-headers-policy --response-headers-policy-config file://headers-policy.json
```

## 3. GitHub to AWS: the OIDC role

1. In IAM add the OpenID Connect provider `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`) if the account does not have it.
2. Create the role `<DEPLOY_ROLE_NAME>` with this **trust policy**. The deploy job uses the GitHub Environment `sandbox`, and for a job with an environment GitHub puts the *environment* in the token subject (not the branch), so the subject below is the environment. To keep it to the `sandbox` branch, set the environment's "Deployment branches" to `sandbox` only (Settings, Environments, sandbox).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:the-shards/landing:environment:sandbox"
        }
      }
    }
  ]
}
```

3. Attach this **permissions policy** (nothing else):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/*"
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
    }
  ]
}
```

## 4. GitHub Environment, secrets and variables

Create the Environment `sandbox` (Settings, Environments), restricted to the `sandbox` branch. Then copy the two example files, fill them in (they are ignored by git) and load them:

```powershell
Copy-Item .env.secret.sandbox.example .env.secret.sandbox
Copy-Item .env.var.sandbox.example .env.var.sandbox
# edit both files, then:
$env:GH_TOKEN = [Environment]::GetEnvironmentVariable('GH_SHARD_TOKEN','User')
gh secret set -f .env.secret.sandbox --env sandbox -R the-shards/landing
gh variable set -f .env.var.sandbox --env sandbox -R the-shards/landing
```

| Name | Kind | Meaning |
|---|---|---|
| `AWS_ROLE_ARN` | secret | the role from section 3 |
| `AWS_REGION` | variable | region of the bucket, e.g. `us-east-1` |
| `S3_BUCKET` | variable | bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | variable | distribution id |
| `VITE_API_BASE` | variable | API address baked into the build (no trailing slash) |

## 5. Deploy

Push (or fast-forward) the `sandbox` branch, or run the workflow by hand on it (Actions, "Deploy to S3 + CloudFront", Run workflow, branch `sandbox`). It runs the tests, builds, uploads `dist/static` first (hashed bundles, cached one year), then the other files (one day), then `index.html` (`no-cache`), and invalidates `/*`.

Check afterwards: the site loads over HTTPS, `/fairness` and a refresh on `/login` work, the response headers match section 2 (browser dev tools, Network), and signup and the download work against the API (the API's CORS must list the site's origin).

## 6. Cutover from GitHub Pages

The repo currently serves `main` through GitHub Pages at `https://theshardsgame.com` (a `CNAME` file and `.nojekyll`). The React source on `main` would break that site, so do this in order and **do not merge to `main` until step 4**:

1. Build the AWS side (sections 1 to 4) and deploy the branch to the CloudFront domain (`dxxxx.cloudfront.net`). Test it there. (The CSP and CORS use the API address, not the site address, so the CloudFront domain works for testing once the API allows that origin.)
2. Lower the DNS TTL on `theshardsgame.com` a day ahead.
3. In GitHub, repo Settings, Pages: set the source to "None" / unpublish (this also frees the custom domain).
4. Merge to `main`. This branch already deletes `CNAME` and `.nojekyll`; if they are still present on the branch you merge, delete them.
5. In DNS (Route 53 or wherever the zone lives), point `theshardsgame.com` at the distribution: an alias A (and AAAA) record to the CloudFront domain; for the `www` name, a CNAME or alias to the same.
6. Wait for DNS, check `https://theshardsgame.com` serves the CloudFront site with a valid certificate, then check the headers again.
7. Rollback if needed: re-enable Pages from the previous `main` commit and point DNS back.
