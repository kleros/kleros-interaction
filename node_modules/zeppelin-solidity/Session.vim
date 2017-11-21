let SessionLoad = 1
let s:so_save = &so | let s:siso_save = &siso | set so=0 siso=0
let v:this_session=expand("<sfile>:p")
silent only
cd ~/scs/zeppelin/master
if expand('%') == '' && !&modified && line('$') <= 1 && getline(1) == ''
  let s:wipebuf = bufnr('%')
endif
set shortmess=aoO
badd +1 README.md
badd +2 contracts/Bounty.sol
badd +1 test/helpers/StandardTokenMock.sol
badd +9 truffle.js
badd +6 contracts/token/ERC20.sol
badd +37 contracts/token/BasicToken.sol
badd +2 contracts/token/ERC20Basic.sol
badd +77 build/contracts/ERC20Basic.json
badd +29 test/StandardToken.js
badd +1 contracts/crowdsale/FinalizableCrowdsale.sol
badd +1 test/RefundVault.js
badd +2 contracts/crowdsale/RefundVault.sol
badd +97 contracts/crowdsale/Crowdsale.sol
badd +23 contracts/crowdsale/CappedCrowdsale.sol
badd +12 .travis.yml
badd +1 package.json
badd +1 scripts/coveralls.sh
badd +1 test/ECRecovery.js
badd +1 contracts/ECRecovery.sol
badd +2 test/helpers/hashMessage.js
badd +1 package-lock.json
badd +1 key
badd +0 contracts/MerkleProof.sol
badd +0 migrations/2_deploy_contracts.js
badd +0 test/helpers/merkleTree.js
argglobal
silent! argdel *
set stal=2
edit package.json
set splitbelow splitright
set nosplitbelow
set nosplitright
wincmd t
set winminheight=1 winminwidth=1 winheight=1 winwidth=1
argglobal
setlocal fdm=manual
setlocal fde=0
setlocal fmr={{{,}}}
setlocal fdi=#
setlocal fdl=0
setlocal fml=1
setlocal fdn=20
setlocal fen
silent! normal! zE
let s:l = 7 - ((6 * winheight(0) + 39) / 78)
if s:l < 1 | let s:l = 1 | endif
exe s:l
normal! zt
7
normal! 06|
tabedit package-lock.json
set splitbelow splitright
set nosplitbelow
set nosplitright
wincmd t
set winminheight=1 winminwidth=1 winheight=1 winwidth=1
argglobal
setlocal fdm=manual
setlocal fde=0
setlocal fmr={{{,}}}
setlocal fdi=#
setlocal fdl=0
setlocal fml=1
setlocal fdn=20
setlocal fen
silent! normal! zE
let s:l = 4877 - ((38 * winheight(0) + 39) / 78)
if s:l < 1 | let s:l = 1 | endif
exe s:l
normal! zt
4877
normal! 06|
tabedit contracts/MerkleProof.sol
set splitbelow splitright
set nosplitbelow
set nosplitright
wincmd t
set winminheight=1 winminwidth=1 winheight=1 winwidth=1
argglobal
setlocal fdm=manual
setlocal fde=0
setlocal fmr={{{,}}}
setlocal fdi=#
setlocal fdl=0
setlocal fml=1
setlocal fdn=20
setlocal fen
silent! normal! zE
let s:l = 12 - ((11 * winheight(0) + 39) / 78)
if s:l < 1 | let s:l = 1 | endif
exe s:l
normal! zt
12
normal! 0
tabedit test/helpers/merkleTree.js
set splitbelow splitright
set nosplitbelow
set nosplitright
wincmd t
set winminheight=1 winminwidth=1 winheight=1 winwidth=1
argglobal
setlocal fdm=manual
setlocal fde=0
setlocal fmr={{{,}}}
setlocal fdi=#
setlocal fdl=0
setlocal fml=1
setlocal fdn=20
setlocal fen
silent! normal! zE
let s:l = 1 - ((0 * winheight(0) + 39) / 78)
if s:l < 1 | let s:l = 1 | endif
exe s:l
normal! zt
1
normal! 0
tabnext 3
set stal=1
if exists('s:wipebuf') && getbufvar(s:wipebuf, '&buftype') isnot# 'terminal'
  silent exe 'bwipe ' . s:wipebuf
endif
unlet! s:wipebuf
set winheight=1 winwidth=20 winminheight=1 winminwidth=1 shortmess=filnxtToO
let s:sx = expand("<sfile>:p:r")."x.vim"
if file_readable(s:sx)
  exe "source " . fnameescape(s:sx)
endif
let &so = s:so_save | let &siso = s:siso_save
let g:this_session = v:this_session
let g:this_obsession = v:this_session
let g:this_obsession_status = 2
doautoall SessionLoadPost
unlet SessionLoad
" vim: set ft=vim :
