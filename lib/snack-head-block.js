/* ==========================================================
   lib/snack-head-block.js — Snack Media's head block, VERBATIM

   Source: Jason (Snack Media). Identical (ignoring email line wrapping)
   to the 25 Nov 2026 production handoff, and to the block proven on
   staging at commit e86559e. Pasted unchanged, including the vendor's
   obfuscated CMP scripts. Do NOT edit, reformat or "tidy" anything
   inside the string below.

   Used by: api/puzzle-page.js (dated puzzle pages), lib/snack-page.js
   (blog posts at serve time, and the static-page port script). The
   eight home/archive/club templates carry the same block inline.
   This file contains data only; importing it runs no vendor code.
   ========================================================== */

export const SNACK_HEAD_BLOCK = String.raw`<!-- Snack Media - Meta Tags -->
<meta name="pbstck_context:site_name" content="topclubten.com" />
<meta name="pbstck_context:website" content="topclubten.com" />
<!-- Google Consent Mode defaults + gtag config -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    'ad_storage': 'granted',
    'ad_user_data': 'granted',
    'ad_personalization': 'granted',
    'analytics_storage': 'granted'
  });
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'region': ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH'],
    'wait_for_update': 500
  });
  gtag('js', new Date());
  gtag('config', 'G-M8E5NFRXB5');
</script>
<!-- Snack Media - CMP -->
<script type="text/javascript">!(function(Y,D,A,U,M,s){s=[],M=function(){s[s.length]=arguments},M.q=s,(M=Y[D=A(A(D))]=Y[D]||M).v=M.v||4,M.s=1+0})(window,'%256%31%25%36%34%25%36%44%25%36%39r%61%25%36%43',decodeURI);!(function(Y,D,A,U,M,s,N,z,K){s=function(r,s){return r<2&&s};try{D[A]=D[A]||function(Y){Y?N[Y]=!0:s()},N=D[A]}catch(Q){return void s()}!(function t(D,A,G,w){function O(){try{if(N[G&&G.src||A]||N[z])return}catch(Q){return void s()}G&&(G.remove(),G=null),clearTimeout(K),!D&&A&&(A+=(-1===A.indexOf("?")?"?":"&")+"r=1"),(A=s(++D,A))&&t(D,A)}(G=Y.createElement(U)).__apNoHold=!0,w=Y.getElementsByTagName(U)[0],G.async=1,G.src=A,D>0&&(G.fetchPriority="high"),K=setTimeout(O,6e3+2e3*D),G[M]("error",O),G[M]("load",O),w.parentNode.insertBefore(G,w)})(0,z="https://cloudforestsystems.com/dist/r3ukdx691/4g23all0.js")})(document,window,"QS01RURFNzIxODNCRDkxODFGQUMyOTBCOTMtMzYy","script","addEventListener",{});;</script>
<script type="text/javascript">;</script>
<script type="text/javascript">!(function(Y,D,A,U,M,s,N,z,K,Q,t,_name,G,w,O,F,L,p,H,P,R,m){_name=(t=function(Y){return D(D(Y))})('%61%25%36%34%25%36D%25%36%39%25%372al');try{G=Y.localStorage,w=Y.sessionStorage}catch(e){G=w={}}O=t('%255F%2561%64%256Drl%25%363%6B%2576p'),L=Y.location;try{0===document.referrer.indexOf(L.origin)?(F=new URLSearchParams(L.search)).get(t('%5F%25%361cr%69'))?((p=F.get(t('%5Fa%256%33%257%34')))===t('%2565%2578%74%65%25%36Ed')?H=[["admiral-extended","true"||_name]]:p===t('s%25%36%38%256%31p%25%36%35')&&(H=[["admiral-shaped","true"||_name]]),H&&(w[O]=JSON.stringify(H))):H=JSON.parse(w[O]||"[]"):delete w[O]}catch(e){H=[]}function n(D,A){try{D=JSON.parse(G["_aQS01RURFNzIxODNCRDkxODFGQUMyOTBCOTMtMzYy"]||"{}").lgk||[]}catch(e){D=[]}H&&(D=D.concat(H)),D&&D.length&&(A=Y[P].pubads())&&D.forEach((function(Y){Y&&Y[0]&&A.setTargeting(Y[0],Y[1]||"")}))}P=t('%2567oog%25%36Ce%2574%61g');try{m=(R=Y[P]=Y[P]||{}).cmd=R.cmd||[],typeof R.pubads===A?n():typeof m.unshift===A?m.unshift(n):m.push(n)}catch(e){}})(window,decodeURI,"function");;</script>
<script type="text/javascript">!(function(Y,D,_name,A,U,M,s){_name=(s=function(Y){return D(D(Y))})(_name),Y[s('%5F%255%46%25%361d%256%44%69%2572a%25%36%43%255%46%67%25%365t%254%33o%25%36%45%25%37%33%25%36%35%25%36Et%25%34%36or%25%34%37%255%34%4D')]=function(D){function A(Y,A){var U,M,s;D((M=!A,s=(U=Y)&&U.purpose&&U.purpose.consents||{},{adConsentGranted:M||!!s[1],adUserData:M||!!s[7],adPersonalization:M||!!s[3],analyticsConsentGranted:M||!!s[1],personalizationConsentGranted:M||!!s[5],functionalityConsentGranted:M||!1,securityConsentGranted:M||!0}))}Y[_name](U,M+"loaded",(function(D){D&&D.tcData&&D.tcData.gdprApplies?(D.consentKnown&&A(D.tcData,!0),Y[_name](U,M+"updated",(function(Y){A(Y.tcData,!0)}))):A({},!1)}))}})(window,decodeURI,'a%2564%25%36%44%256%39%72%256%31%256%43',0,"after","cmp.");;;!(function(Y,D,A,U,M){function s(){for(var Y=[],A=0;A<arguments.length;A++)Y.push(arguments[A]);if(!Y.length)return M;"ping"===Y[0]?Y[2]({gdprAppliesGlobally:!!D[decodeURI(decodeURI('%25%35F_cm%257%30%2547%25%364%70%257%32%41%2570%70l%2569%65%73%47l%6F%25%36%32%25%36%31%256C%25%36Cy'))],cmpLoaded:!1,cmpStatus:"stub"}):Y.length>0&&M.push(Y)}function N(Y){if(Y&&Y.data&&Y.source){var U,M=Y.source,s="__tcfapiCall",N="string"==typeof Y.data&&Y.data.indexOf(s)>=0;(U=N?((function(Y){try{return JSON.parse(Y)}catch(D){}})(Y.data)||{})[s]:(Y.data||{})[s])&&D[A](U.command,U.version,(function(Y,D){var A={__tcfapiReturn:{returnValue:Y,success:D,callId:U.callId}};M&&M.postMessage(N?JSON.stringify(A):A,"*")}),U.parameter)}}!(function z(){if(!D.frames[U]){var A=Y.body;if(A){var M=Y.createElement("iframe");M.style.display="none",M.name=U,A.appendChild(M)}else D.setTimeout(z,5)}})(),s.v=1,"function"!=typeof D[A]&&(D[A]=D[A]||s,D.addEventListener?D.addEventListener("message",N,!1):D.attachEvent&&D.attachEvent("onmessage",N))})(document,window,"__tcfapi","__tcfapiLocator",[]);;;!(function(Y,D,A,U,M,s,N,z,K,Q,t){function G(){for(var Y=[],D=arguments.length,A=0;A<D;A++)Y.push(arguments[A]);var U,M=Y[1],s=typeof M===N,z=Y[2],G={gppVersion:"1.1",cmpStatus:"stub",cmpDisplayStatus:"hidden",signalStatus:"not ready",supportedAPIs:["7:usnat"].reduce((function(Y,D){return D&&Y.push(D),Y}),[]),cmpId:9,sectionList:[],applicableSections:[0],gppString:"",parsedSections:{}};function w(Y){s&&M(Y,!0)}switch(Y[0]){case"ping":return w(G);case"queue":return K;case"events":return Q;case"addEventListener":return s&&(U=++t,Q.push({id:U,callback:M,parameter:z})),w({eventName:"listenerRegistered",listenerId:U,data:!0,pingData:G});case"removeEventListener":for(U=!1,A=0;A<Q.length;A++)if(Q[A].id===z){Q.splice(A,1),U=!0;break}return w(U);case"hasSection":case"getSection":case"getField":return w(null);default:return void K.push(Y)}}G.v=2,typeof D[A]!==N&&(D[A]=D[A]||G,D[z]&&D[z]("message",(function(Y,U){var N="string"==typeof Y.data;(U=N?((function(Y){try{return JSON.parse(Y)}catch(D){}})(Y.data)||{})[M]:(Y.data||{})[M])&&D[A](U.command,(function(D,A){var M={__gppReturn:{returnValue:D,success:A,callId:U.callId}};Y.source.postMessage(N?JSON.stringify(M):M,"*")}),s in U?U[s]:null,U.version||1)}),!1),(function w(){if(!D.frames[U]){var A=Y.body;if(A){var M=Y.createElement("iframe");M.style.display="none",M.name=U,A.appendChild(M)}else D.setTimeout(w,5)}})())})(document,window,"__gpp","__gppLocator","__gppCall","parameter","function","addEventListener",[],[],0);</script>
<!-- Snack Media - Google Consent Mode Bridge -->
<script>
  if (typeof window.__tcfapi === 'function') {
    window.__tcfapi('addEventListener', 2, function (tcData, success) {
      if (!success || !tcData) return;
      if (tcData.gdprApplies === false) {
        gtag('consent', 'update', {
          'ad_storage': 'granted', 'ad_user_data': 'granted',
          'ad_personalization': 'granted', 'analytics_storage': 'granted'
        });
        return;
      }
      if (tcData.eventStatus === 'tcloaded' || tcData.eventStatus ===
'useractioncomplete') {
        var p = (tcData.purpose && tcData.purpose.consents) || {};
        gtag('consent', 'update', {
          'ad_storage':         p[1] ? 'granted' : 'denied',
          'ad_user_data':       p[7] ? 'granted' : 'denied',
          'ad_personalization': p[3] ? 'granted' : 'denied',
          'analytics_storage':  p[1] ? 'granted' : 'denied'
        });
      }
    });
  }
</script>
<!-- gtag.js loader -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-M8E5NFRXB5"></script>
<!-- Snack Media - Ad Quality -->
<link rel="preload" href="https://snackmedia-ron-tagan.adlightning.com/op.js" as="script">
<script fetchpriority="high" src="https://snackmedia-ron-tagan.adlightning.com/op.js"></script>
<!-- Snack Media - Loader -->
<script async src="https://boot.pbstck.com/v1/adm/1b408d8a-368b-4a29-9f92-617f120e5784"></script>
`;
