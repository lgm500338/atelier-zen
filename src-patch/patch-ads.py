# 인앱 광고 붙이기: 현재 index.html(번호 색칠 패치가 들어간 버전)에 적용
# 사용법: python3 patch-ads.py ../index.html ../index.html
import sys
src=open(sys.argv[1],encoding='utf8').read()
ads=open('az-ads.js',encoding='utf8').read()
def rep(old,new,count=1):
    global src
    n=src.count(old)
    assert n==count,(old[:70],n)
    src=src.replace(old,new)
# 1) 번들 안의 토스 광고 SDK 함수를 window로 꺼내기
rep('Object.assign(e=>ei(`loadFullScreenAd`,',
    'window.__AZAdsSDK=window.__AZAdsSDK||{};window.__AZAdsSDK.load=Object.assign(e=>ei(`loadFullScreenAd`,')
rep('Object.assign(e=>ei(`showFullScreenAd`,',
    'window.__AZAdsSDK.show=Object.assign(e=>ei(`showFullScreenAd`,')
# 2) 멍때리기: 다음 그림으로 넘어갈 때 광고 (잠들기 모드 Ce면 광고 없음)
rep('onNextArtwork:i===`lesson`?()=>y(e=>(e+1)%po.length):je,',
    'onNextArtwork:window.__azNext(Ce,i===`lesson`?()=>y(e=>(e+1)%po.length):je),')
# 3) 컬러링 스튜디오 앞에 도안 횟수 확인
rep('Pa=e=>window.__AZWrap(e,Pa0,C,O,tt,qe),',
    'Pa=e=>window.__AZGate(e,C,O,PaW),PaW=e=>window.__AZWrap(e,Pa0,C,O,tt,qe),')
# 4) 광고 스크립트를 앱 코드보다 먼저 불러오기
rep('<script type="module" crossorigin>','<script>\n'+ads+'\n</script>\n    <script type="module" crossorigin>')
open(sys.argv[2],'w',encoding='utf8').write(src)
print('ok',len(src))
