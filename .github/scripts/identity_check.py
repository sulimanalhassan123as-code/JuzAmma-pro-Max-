import json,os,sys,urllib.request,fnmatch
REPO=os.environ['GITHUB_REPOSITORY']; TOKEN=os.environ['GH_TOKEN']
def api(p):
    r=urllib.request.Request('https://api.github.com'+p,headers={'Authorization':'Bearer '+TOKEN,'Accept':'application/vnd.github+json'})
    return json.load(urllib.request.urlopen(r,timeout=45))
ev=os.environ.get('EVENT_NAME','')
shas=[]
if ev=='pull_request':
    n=json.load(open(os.environ['GITHUB_EVENT_PATH']))['pull_request']['number']
    for c in api('/repos/%s/pulls/%d/commits?per_page=100'%(REPO,n)): shas.append(c['sha'])
else:
    shas=[os.environ['GITHUB_SHA']]
reg=json.load(open('AGENT-IDENTITIES.json'))
ids={i['email'].lower():i for i in reg['identities']}
def ok(path,pats):
    for p in pats:
        if p=='**': return True
        if p.endswith('/**') and (path==p[:-3] or path.startswith(p[:-2])): return True
        if fnmatch.fnmatch(path,p): return True
    return False
bad=[]
for sha in shas:
    c=api('/repos/%s/commits/%s'%(REPO,sha))
    a=c['commit']['author']; email=a['email'].lower(); msg=c['commit']['message']
    subj=msg.splitlines()[0]; body='\n'.join(msg.splitlines()[1:])
    ident=ids.get(email)
    if not ident:
        bad.append('%s: author "%s" <%s> is NOT in AGENT-IDENTITIES.json'%(sha[:8],a['name'],email)); continue
    if ident['id']!='owner':
        pre=ident['commit_prefix']
        if pre and not subj.lower().startswith(pre.lower()):
            bad.append('%s: %s message must start with "%s" (got "%s")'%(sha[:8],ident['id'],pre,subj[:40]))
        if ('Agent-ID: '+ident['id']) not in body and ('Agent-ID: '+ident['id']) not in msg:
            bad.append('%s: %s commit body missing trailer "Agent-ID: %s"'%(sha[:8],ident['id'],ident['id']))
    for f in (c.get('files') or []):
        path=f['filename']
        if not ok(path,ident['paths']):
            bad.append('%s: %s touched "%s" outside its scope'%(sha[:8],ident['id'],path))
print('commits checked:',len(shas))
if bad:
    print('::error::Identity and scope violations')
    for b in bad: print('  FAIL',b)
    print('\nRegistered identities:')
    for i in reg['identities']:
        print('   %-13s %-34s prefix=%-8s scope=%s'%(i['id'],i['email'],i['commit_prefix'] or '-',', '.join(i['paths'])[:56]))
    sys.exit(1)
print('PASS - every commit matches a registered identity and stays in scope')
