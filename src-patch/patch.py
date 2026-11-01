import sys
src=open(sys.argv[1],encoding='utf8').read()
eng=open('az-number.js',encoding='utf8').read()
def rep(old,new,count=1):
    global src
    n=src.count(old)
    assert n==count, (old[:60], n)
    src=src.replace(old,new)
rep('Pa=({artwork:e,onSaveToGallery:t,onBackToTimelapse:n})=>{',
    'Pa=e=>window.__AZWrap(e,Pa0,C,O,tt,qe),Pa0=({artwork:e,onSaveToGallery:t,onBackToTimelapse:n})=>{')
rep('async function za(e,t=','async function za(e,t){return window.AZNum.photoArtwork(e,t)}async function zaLegacy(e,t=')
rep('{id:`fine`,label:`세밀한 펜선`},{id:`medium`,label:`스케치 펜`},{id:`bold`,label:`굵은 라인`}',
    '{id:`bold`,label:`쉬움 · 큰 칸`},{id:`medium`,label:`보통`},{id:`fine`,label:`자세히 · 작은 칸`}')
rep('children:`펜 선 스타일`','children:`색칠 난이도`')
rep('className:`grid grid-cols-2 gap-3 text-xs text-stone-600`,children:[(0,O.jsxs)(`div`,{children:[(0,O.jsxs)(`div`,{className:`flex justify-between mb-1`,children:[(0,O.jsx)(`span`,{children:`윤곽선 민감도`',
    'className:`hidden`,children:[(0,O.jsxs)(`div`,{children:[(0,O.jsxs)(`div`,{className:`flex justify-between mb-1`,children:[(0,O.jsx)(`span`,{children:`윤곽선 민감도`')
rep('(0,O.jsxs)(`label`,{className:`flex items-center gap-2 text-xs text-stone-700 cursor-pointer pt-1`,children:[(0,O.jsx)(`input`,{type:`checkbox`,checked:u.colorWash',
    '(0,O.jsxs)(`label`,{className:`hidden`,children:[(0,O.jsx)(`input`,{type:`checkbox`,checked:u.colorWash')
rep('사각사각 펜 스케치 도안으로 바꿔드려요.','번호를 따라 칠하는 색칠 도안으로 바꿔드려요.')
rep('<script type="module" crossorigin>','<script>\n'+eng+'\n</script>\n    <script type="module" crossorigin>')
open(sys.argv[2],'w',encoding='utf8').write(src)
print('ok',len(src))
