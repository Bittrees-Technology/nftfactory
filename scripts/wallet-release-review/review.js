'use strict';
const $=id=>document.getElementById(id);
let manifest,provider,hashes=[],busy=false;
const chainHex=()=>`0x${manifest.chainId.toString(16)}`;
const chainName=()=>({11155111:'Sepolia',8453:'Base mainnet',4663:'Robinhood mainnet'})[manifest.chainId];
const request=(method,params=[])=>provider.request({method,params});
function note(s){$('status').textContent=s;}
async function checkWallet(){
 if(await request('eth_chainId')!==chainHex())throw Error(`Select ${chainName()} in your wallet before continuing.`);
 const accounts=await request('eth_accounts');
 if(accounts[0]?.toLowerCase()!==manifest.signer.toLowerCase())throw Error('Use the confirmed raging.eth signing wallet.');
}
function render(){
 $('transactions').replaceChildren(...manifest.transactions.map((t,i)=>{
  const li=document.createElement('li');li.textContent=`${i+1}. ${t.transactionType==='CREATE'?'Deploy':'Configure'} ${t.contractName||'contract'}${t.function?': '+t.function:''}${hashes[i]?' · submitted':''}`;
  const small=document.createElement('small');small.textContent=`${t.contractAddress} · value: 0 ETH (network fee applies)`;li.append(small);
  const details=document.createElement('details'),summary=document.createElement('summary'),code=document.createElement('code');summary.textContent='Inspect exact transaction data';code.textContent=t.transaction.input;details.append(summary,code);li.append(details);return li;
 }));
}
async function receipt(hash){
 while(true){const r=await request('eth_getTransactionReceipt',[hash]);if(r)return r;note('Waiting for confirmation. Keep this page open.');await new Promise(r=>setTimeout(r,2500));}
}
async function validateReceipt(index,r){
 if(r.status!=='0x1')throw Error('A transaction reverted. Stop here and return to Codex; do not continue the sequence.');
 const expected=manifest.transactions[index];
 if(r.from?.toLowerCase()!==manifest.signer.toLowerCase())throw Error('Receipt signer mismatch.');
 if(expected.transactionType==='CREATE'&&r.contractAddress?.toLowerCase()!==expected.contractAddress.toLowerCase())throw Error('Deployed address differs from the reviewed simulation. Stop here.');
 const tx=await request('eth_getTransactionByHash',[r.transactionHash]);
 if(tx.input?.toLowerCase()!==expected.transaction.input.toLowerCase()||BigInt(tx.nonce)!==BigInt(expected.transaction.nonce)||BigInt(tx.value)!==0n||(tx.to||'').toLowerCase()!==(expected.transaction.to||'').toLowerCase())throw Error('Confirmed transaction differs from the reviewed request.');
}
$('connect').onclick=async()=>{try{
 provider=window.ethereum?.providers?.find(p=>p.isRabby)||window.ethereum;
 if(!provider)throw Error('Open this local page in the browser with your Rabby wallet.');
 await request('eth_requestAccounts');
 if(await request('eth_chainId')!==chainHex())await request('wallet_switchEthereumChain',[{chainId:chainHex()}]);
 await checkWallet();$('next').disabled=busy||hashes.length===manifest.transactions.length;note('Connected. Review the transaction list, then request the next wallet approval.');
}catch(e){note(e.message);}};
$('next').onclick=async()=>{if(busy)return;busy=true;$('next').disabled=true;try{
 await checkWallet();
 for(let i=0;i<hashes.length;i++)await validateReceipt(i,await receipt(hashes[i]));
 const i=hashes.length;
 if(i===manifest.transactions.length){$('complete').hidden=false;note('All 22 deployment requests confirmed. Safe acceptance is still required.');return;}
 const {transaction:t}=manifest.transactions[i];
 const pending=await request('eth_getTransactionCount',[manifest.signer,'pending']);
 if(BigInt(pending)!==BigInt(t.nonce))throw Error('The wallet transaction sequence changed. Stop and ask Codex to refresh the simulation.');
 note(`Review request ${i+1} of ${manifest.transactions.length} in your wallet.`);
 await checkWallet();
 const hash=await request('eth_sendTransaction',[{from:manifest.signer,...(t.to?{to:t.to}:{}),data:t.input,value:'0x0',nonce:t.nonce,chainId:chainHex()}]);
 hashes.push(hash);
 const saved=await fetch('/receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(hashes)});
 if(!saved.ok)throw Error('Receipt recording failed. Do not resubmit. Return to Codex with the transaction hash: '+hash);
 render();await validateReceipt(i,await receipt(hash));
 note(`Confirmed ${hashes.length} of ${manifest.transactions.length}. ${hashes.length===manifest.transactions.length?'All deployment requests are complete. Return to Codex for Safe acceptance.':'You can review the next request.'}`);
 if(hashes.length===manifest.transactions.length)$('complete').hidden=false;
}catch(e){note(e.message);}finally{busy=false;$('next').disabled=hashes.length===manifest.transactions.length;}};
Promise.all([fetch('/manifest').then(r=>r.json()),fetch('/receipts').then(r=>r.json())]).then(([m,h])=>{manifest=m;hashes=h;$('network').textContent=chainName();$('network-title').textContent=`Review the ${chainName()} deployment.`;$('signer').textContent=m.signer;$('safe').textContent=m.adminSafe;render();note(`${hashes.length} of ${m.transactions.length} requests recorded. Connect your wallet to continue.`);}).catch(()=>note('Could not load the reviewed deployment. Return to Codex.'));
