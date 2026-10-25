<?php
declare(strict_types=1);
// PHP 8.2+; install in www/3dmoymyach.ru/order; storage stays outside www/.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
function answer(int $status, array $data): never { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE); exit; }
function inside(string $path, string $parent): bool { $path=str_replace('\\','/', $path); $parent=rtrim(str_replace('\\','/', $parent),'/'); if (PHP_OS_FAMILY==='Windows') {$path=strtolower($path);$parent=strtolower($parent);} return $path===$parent || str_starts_with($path,$parent.'/'); }
function textValue(array $data, string $key, int $max): string { $v=$data[$key]??''; if(!is_string($v)||strlen($v)>$max*4||!preg_match('//u',$v)||preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/',$v))answer(422,['error'=>'Проверьте текстовые поля.']); if(preg_match_all('/./us',$v)>$max)answer(422,['error'=>'Слишком длинный текст в одном из полей.']);return trim($v); }
function storeFile(string $path, string $data): void { if(file_put_contents($path,$data,LOCK_EX)!==strlen($data))throw new RuntimeException('write');chmod($path,0600); }
const LEGAL_VERSION='2026-10-11.1';
const MAX_PLAYERS=32;
const MAX_FILE=10485760;
const MAX_VECTOR=26214400; // векторные логотипы (AI, EPS, CDR, SVG) — до 25 МБ
const VECTOR_EXT=['ai','eps','cdr','svg'];
// Проверка безопасности содержимого: SVG без скриптов, обработчиков событий, внешних сущностей и вставок HTML;
// PDF/AI без JavaScript и автозапуска. Оригинал не изменяется — небезопасный файл просто не принимается.
function fileIsSafe(string $tmp,string $kind):bool{
 if($kind==='svg'){
  $t=(string)file_get_contents($tmp);
  if(preg_match('/<script|<!ENTITY|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:|data:text\/html/i',$t))return false;
  if(preg_match('/(?:xlink:)?href\s*=\s*["\']\s*(?:https?:|\/\/|file:)/i',$t))return false;
  return true;
 }
 if($kind==='pdf'||$kind==='ai'){
  $fh=fopen($tmp,'rb');if(!$fh)return false;$prev='';
  while(!feof($fh)){$chunk=$prev.fread($fh,1048576);if(preg_match('~/(JavaScript|JS|Launch|SubmitForm|ImportData)\b~',$chunk)){fclose($fh);return false;}$prev=substr($chunk,-32);}
  fclose($fh);return true;
 }
 return true;
}
// Уменьшенная копия растрового изображения для просмотра менеджером (оригинал не меняется).
function makePreview(string $src,string $dest):bool{
 if(!function_exists('imagecreatefromstring')||!function_exists('imagejpeg'))return false;
 $data=@file_get_contents($src);if($data===false)return false;$im=@imagecreatefromstring($data);if(!$im)return false;
 $w=imagesx($im);$h=imagesy($im);$k=min(1,400/max($w,$h));$nw=max(1,(int)round($w*$k));$nh=max(1,(int)round($h*$k));
 $out=imagecreatetruecolor($nw,$nh);imagefill($out,0,0,imagecolorallocate($out,255,255,255));imagecopyresampled($out,$im,0,0,0,0,$nw,$nh,$w,$h);
 $ok=imagejpeg($out,$dest,82);imagedestroy($im);imagedestroy($out);return $ok;
}
// Определяет тип файла логотипа по содержимому (не только по расширению). Возвращает расширение для хранения или null.
function logoKind(string $tmp, string $name, finfo $finfo): ?string {
 $ext=strtolower(pathinfo($name,PATHINFO_EXTENSION));$head=(string)file_get_contents($tmp,false,null,0,4096);$mime=(string)$finfo->file($tmp);
 if($ext==='ai')return (str_starts_with($head,'%PDF-')||str_starts_with($head,'%!PS'))?'ai':null;
 if($ext==='eps'||$ext==='epsf')return (str_starts_with($head,'%!PS')||str_starts_with($head,"\xC5\xD0\xD3\xC6"))?'eps':null;
 if($ext==='cdr')return ((str_starts_with($head,'RIFF')&&substr($head,8,3)==='CDR')||str_starts_with($head,"PK\x03\x04"))?'cdr':null;
 if($ext==='svg'){$t=ltrim(preg_replace('/^\xEF\xBB\xBF/','',$head));return (preg_match('//u',$head)&&preg_match('/<svg[\s>]/i',$t)&&(str_starts_with($t,'<')))?'svg':null;}
 $kind=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','application/pdf'=>'pdf'][$mime]??null;
 if($kind==='pdf')return str_starts_with($head,'%PDF-')?'pdf':null;
 if($kind){$im=@getimagesize($tmp);return ($im&&$im[0]*$im[1]<=50000000&&($im['mime']??'')===$mime)?$kind:null;}
 return null;
}
const MAX_TOTAL=104857600;
$method=$_SERVER['REQUEST_METHOD']??'GET';
if(!in_array($method,['GET','POST'],true)){header('Allow: GET, POST');answer(405,['error'=>'Метод не поддерживается.']);}
if($method==='POST' && (int)($_SERVER['CONTENT_LENGTH']??0)>MAX_TOTAL+2097152)answer(413,['error'=>'Общий размер файлов превышает 100 МБ.']);
if($method==='POST' && !$_POST && (int)($_SERVER['CONTENT_LENGTH']??0)>0)answer(413,['error'=>'Превышен лимит загрузки на сервере. Выберите фотографии меньшего размера или обратитесь к менеджеру.']);
session_name('moymyach_form');
session_set_cookie_params(['lifetime'=>0,'path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']),'/\\').'/','secure'=>(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'),'httponly'=>true,'samesite'=>'Lax']);
ini_set('session.use_strict_mode','1');
if(!session_start())answer(503,['error'=>'Не удалось открыть сессию формы.']);
$_SESSION['csrf']??=bin2hex(random_bytes(32));
try {
 $storage=getenv('MOYMYACH_STORAGE_DIR');
 if(!$storage){
  // This package is installed at HOME/www/3dmoymyach.ru/order/.
  // Keep customer files outside the entire public www directory.
  if(basename(__DIR__)!=='order'||basename(dirname(__DIR__))!=='3dmoymyach.ru'||basename(dirname(__DIR__,2))!=='www')throw new RuntimeException('unexpected installation directory');
  $storage=dirname(__DIR__,3).'/moymyach-orders';
 }
 $parent=realpath(dirname($storage));$docroot=realpath($_SERVER['DOCUMENT_ROOT']??'');
 if(!$parent||!$docroot)throw new RuntimeException('storage path');
 $target=$parent.DIRECTORY_SEPARATOR.basename($storage);
 if(inside($target,$docroot)||inside($target,__DIR__))throw new RuntimeException('storage under webroot');
 if(!is_dir($target)&&!mkdir($target,0700))throw new RuntimeException('mkdir');
 $storage=realpath($target);
 if(!$storage||inside($storage,$docroot)||inside($storage,__DIR__)||!is_writable($storage))throw new RuntimeException('storage permissions');
 if(!class_exists('finfo'))throw new RuntimeException('fileinfo required');
}catch(Throwable $e){error_log('MoyMyach: storage configuration unavailable');answer(503,['error'=>'Приём заявок ещё не настроен. Обратитесь к менеджеру.']);}
if($method==='GET')answer(200,['csrf'=>$_SESSION['csrf'],'limits'=>['maxPlayers'=>MAX_PLAYERS,'maxFileBytes'=>MAX_FILE,'maxTotalBytes'=>MAX_TOTAL]]);
if(!is_string($_POST['csrf']??null)||!hash_equals($_SESSION['csrf'],$_POST['csrf']))answer(403,['error'=>'Сессия устарела. Откройте форму заново перед заполнением.']);
$requestId=$_POST['request_id']??'';
if(!is_string($requestId)||!preg_match('/^[a-f0-9-]{36}$/D',$requestId))answer(422,['error'=>'Неверный идентификатор отправки. Обновите страницу.']);
$raw=$_POST['payload']??'';
if(!is_string($raw)||strlen($raw)>131072)answer(422,['error'=>'Слишком большой объём текста.']);
$payload=json_decode($raw,true);
if(!is_array($payload)||($payload['confirmed']??false)!==true)answer(422,['error'=>'Подтвердите правильность фотографий и надписей.']);
if(($payload['privacyAccepted']??false)!==true)answer(422,['error'=>'Необходимо отдельное согласие на обработку ваших персональных данных.']);
if(($payload['materialsConfirmed']??false)!==true)answer(422,['error'=>'Подтвердите законные основания для передачи материалов.']);
if(($payload['legalVersion']??'')!==LEGAL_VERSION)answer(409,['error'=>'Версия условий формы изменилась. Сохраните введённые данные и откройте актуальную форму.']);
$briefType=textValue($payload,'briefType',30);if($briefType==='')$briefType='photo';
if(!in_array($briefType,['photo','football-logos','basketball-logos'],true))answer(422,['error'=>'Выберите корректный бриф.']);
$product=null;$model=null;
if($briefType!=='photo'){
 $rawProduct=$payload['product']??null;if(!is_array($rawProduct))answer(422,['error'=>'Укажите модель и параметры мяча.']);
 $product=[];foreach(['model'=>40,'size'=>10,'colors'=>500,'placement'=>2000,'modelReference'=>500,'embossing'=>1000,'printing'=>20,'material'=>20,'materialColor'=>500] as $key=>$limit)$product[$key]=textValue($rawProduct,$key,$limit);
 $catalog=json_decode((string)file_get_contents(__DIR__.'/brief-models.json'),true);
 $model=$catalog[$product['model']]??null;
 if(!$model||$model['sport'].'-logos'!==$briefType||!in_array($product['size'],$model['sizes'],true))answer(422,['error'=>'Проверьте модель и доступный для неё размер.']);
 $qty=$rawProduct['quantity']??null;if(!is_int($qty)||$qty<1||$qty>100000)answer(422,['error'=>'Укажите целое количество мячей от 1 до 100000.']);
 if($product['colors']==='')answer(422,['error'=>'Укажите цвета мяча.']);
 if($briefType==='basketball-logos'){
  if(!in_array($product['printing'],['print','emboss','combined','help'],true)||!in_array($product['material'],['factory','pantone','help'],true))answer(422,['error'=>'Выберите материал и способ нанесения.']);
  if(!in_array($product['printing'],['emboss','combined'],true))$product['embossing']='';
  if($product['material']!=='pantone')$product['materialColor']='';
 }else{$product['printing']='';$product['material']='';$product['materialColor']='';$product['embossing']='';} 
 if($briefType!=='football-logos')$product['modelReference']='';
 $product['printingLabel']=['print'=>'Печать','emboss'=>'Тиснение','combined'=>'Печать и тиснение','help'=>'Помощь с выбором'][$product['printing']]??'';$product['materialLabel']=['factory'=>'Материал заводского цвета','pantone'=>'Индивидуальная окраска по Pantone','help'=>'Помощь с выбором'][$product['material']]??'';
 $product['quantity']=$qty;$product['title']=$model['title'];$product['url']=$model['url'];
}
$order=textValue($payload,'order',150);$inscription=textValue($payload,'inscription',3000);
$inscriptions=$payload['inscriptions']??($inscription!==''?[$inscription]:[]);
if(!is_array($inscriptions)||!array_is_list($inscriptions)||count($inscriptions)>20)answer(422,['error'=>'Можно добавить до 20 надписей.']);
$inscriptions=array_values(array_filter(array_map(fn($v)=>textValue(['text'=>$v],'text',isset($payload['inscriptions'])?1000:3000),$inscriptions),fn($v)=>$v!==''));
$inscription=implode("\n\n",array_map(fn($i,$v)=>'Надпись '.($i+1).":\n".$v,array_keys($inscriptions),$inscriptions));
$comments=textValue($payload,'comments',5000);$driveLink=textValue($payload,'driveLink',2000);
if($driveLink!==''){$url=parse_url($driveLink);if(!$url||!filter_var($driveLink,FILTER_VALIDATE_URL)||!in_array(strtolower($url['scheme']??''),['http','https'],true)||empty($url['host'])||isset($url['user'])||isset($url['pass']))answer(422,['error'=>'Укажите корректную ссылку на диск: https:// или http://.']);}
$customerRaw=$payload['customer']??null;$deliveryRaw=$payload['delivery']??null;$paymentRaw=$payload['payment']??null;
if(!is_array($customerRaw)||!is_array($deliveryRaw)||!is_array($paymentRaw))answer(422,['error'=>'Заполните контакты, доставку и способ оплаты.']);
$customer=[];foreach(['fullname'=>150,'phone'=>30,'email'=>254,'telegram'=>200,'max'=>200,'vk'=>200] as $k=>$max){$customer[$k]=textValue($customerRaw,$k,$max);}
if($customer['email']===''||!filter_var($customer['email'],FILTER_VALIDATE_EMAIL))answer(422,['error'=>'Укажите электронную почту: на неё придёт номер заказа и ссылка на ваши материалы.']);
$digits=preg_replace('/\D/','',$customer['phone']);
if($customer['fullname']===''||strlen($digits)<7||strlen($digits)>15||!preg_match('/^[+0-9\s().-]+$/D',$customer['phone']))answer(422,['error'=>'Укажите ФИО заказчика и корректный телефон.']);
$delivery=['method'=>textValue($deliveryRaw,'method',10),'address'=>textValue($deliveryRaw,'address',1000)];
if(!in_array($delivery['method'],['cdek','pickup'],true)||($delivery['method']==='cdek'&&$delivery['address']===''))answer(422,['error'=>'Укажите способ получения и адрес СДЭК.']);
if($delivery['method']==='pickup')$delivery['address']='';
$neededDate=textValue($payload,'neededDate',10);$date=DateTimeImmutable::createFromFormat('!Y-m-d',$neededDate);
if(!$date||$date->format('Y-m-d')!==$neededDate)answer(422,['error'=>'Укажите корректную дату, когда нужен мяч.']);
$payment=['type'=>textValue($paymentRaw,'type',15),'companyName'=>textValue($paymentRaw,'companyName',200),'promo'=>textValue($paymentRaw,'promo',40)];
if(!in_array($payment['type'],['individual','company'],true))answer(422,['error'=>'Выберите физическое или юридическое лицо.']);
if($payment['type']==='individual')$payment['companyName']='';
$productionTerms='Срок производства — 2–4 рабочих дня после утверждения макета и оплаты. Время доставки не входит в срок производства.';
if($model)$productionTerms=$model['production'].' Время доставки не входит в срок производства.';
$people=$payload['players']??[];
if(!is_array($people)||!array_is_list($people)||($briefType==='photo'&&count($people)<1)||count($people)>MAX_PLAYERS||($briefType!=='photo'&&count($people)>0))answer(422,['error'=>'Добавьте от 1 до 32 изображений.']);
// Схема раскладки: «32» — 32 отдельные панели; «groups» — панели 2+3 и 18+19 объединены в 33 и 35.
$layout=textValue($payload,'layout',10);if($layout==='')$layout='32';
if(!in_array($layout,['32','groups'],true))answer(422,['error'=>'Выберите схему мяча.']);
$allowedPanels=range(1,32);
if($layout==='groups')$allowedPanels=array_merge(array_values(array_diff($allowedPanels,[2,3,18,19])),[33,35]);
// Панель 22 — техническая (ниппель и логотип фабрики), клиент её не заполняет.
$allowedPanels=array_values(array_diff($allowedPanels,[22]));
$TYPE_LABEL=['regular'=>'Индивидуальное','group'=>'Групповое','main'=>'Главное','logo'=>'Логотип / эмблема','text'=>'Текст'];$withFiles=0;
$validated=[];$keys=[];$total=0;$finfo=new finfo(FILEINFO_MIME_TYPE);$usedPanels=[];
foreach($people as $i=>$person){
 if(!is_array($person))answer(422,['error'=>'Проверьте карточки панелей.']);
 $key=$person['key']??'';
 if(!is_string($key)||!preg_match('/^[1-9][0-9]{0,5}$/D',$key)||isset($keys[$key]))answer(422,['error'=>'Повторяющаяся или неверная карточка.']);$keys[$key]=true;
 $type=$person['type']??'regular';if($type==='emblem')$type='logo';
 if(!is_string($type)||!isset($TYPE_LABEL[$type]))answer(422,['error'=>'Выберите тип изображения: индивидуальное, групповое, главное или логотип.']);
 $surname=textValue($person,'surname',80);$first=textValue($person,'first',80);$patronymic=textValue($person,'patronymic',80);
 $name=textValue($person,'caption',150);if($name==='')$name=trim(preg_replace('/\s+/u',' ',"$surname $first $patronymic"));if($name==='')$name=textValue($person,'fullname',150);
 $number=textValue($person,'number',3);
 $rotation=isset($person['rotation'])&&is_numeric($person['rotation'])?max(-180,min(180,(int)round((float)$person['rotation']))):0;
 $zoom=isset($person['zoom'])&&is_numeric($person['zoom'])?max(30,min(300,(int)round((float)$person['zoom']))):100;
 $offX=isset($person['offsetX'])&&is_numeric($person['offsetX'])?max(-1,min(1,round((float)$person['offsetX'],2))):0;
 $offY=isset($person['offsetY'])&&is_numeric($person['offsetY'])?max(-1,min(1,round((float)$person['offsetY'],2))):0;
 $placement=textValue($person,'placement',200);
 if($number!==''&&!preg_match('/^[0-9]{1,3}$/D',$number))answer(422,['error'=>'Игровой номер — от 1 до 3 цифр.']);
 $panel=textValue($person,'panel',3);
 if(!preg_match('/^[0-9]{1,2}$/D',$panel)||!in_array((int)$panel,$allowedPanels,true))answer(422,['error'=>'Панель '.($panel!==''?$panel:'не указана').' недоступна в выбранной схеме мяча.']);
 if($type!=='text'&&in_array((int)$panel,[33,35],true)!==($type==='group'))answer(422,['error'=>'Групповое фото — только на панелях 33 и 35, и на них — только групповое. Проверьте панель '.$panel.'.']);
 if(isset($usedPanels[(int)$panel]))answer(422,['error'=>'На панели '.$panel.' уже есть изображение. На одну панель — одно изображение.']);$usedPanels[(int)$panel]=true;
 $file=$_FILES['photo_'.$key]??null;
 if($type==='text'){
  if($name==='')answer(422,['error'=>'Панель '.$panel.': напишите текст или добавьте файл.']);
  if(is_array($file))answer(422,['error'=>'Панель '.$panel.': для текстовой панели файл не нужен.']);
  $validated[]=['code'=>'','type'=>'text','typeLabel'=>'Текст','surname'=>'','first'=>'','patronymic'=>'','fullname'=>$name,'number'=>$number,'rotation'=>$rotation,'zoom'=>$zoom,'offsetX'=>$offX,'offsetY'=>$offY,'placement'=>$placement,'panel'=>$panel,'photo'=>'','ext'=>'','format'=>'','originalName'=>'','bytes'=>0,'sha256'=>'','tmp'=>null];
  continue;
 }
 $withFiles++;
 if(!is_array($file)||!isset($file['error'])||is_array($file['error']))answer(422,['error'=>'Панель '.$panel.': добавьте файл.']);
 if($file['error']!==UPLOAD_ERR_OK)answer(422,['error'=>'Панель '.$panel.': файл не загружен. Проверьте размер и попробуйте снова.']);
 if(!is_uploaded_file($file['tmp_name'])||$file['size']<1||$file['size']>MAX_VECTOR)answer(422,['error'=>'Панель '.$panel.': файл должен быть до 25 МБ.']);
 $ext=logoKind($file['tmp_name'],(string)$file['name'],$finfo);
 if(!$ext)answer(422,['error'=>'Панель '.$panel.': нужен JPG, PNG, WebP или вектор CDR, AI, EPS, SVG, PDF. Содержимое файла не совпадает с форматом.']);
 if(in_array($ext,['jpg','png','webp'],true)&&$file['size']>MAX_FILE)answer(422,['error'=>'Панель '.$panel.': фото должно быть до 10 МБ. Вектор — до 25 МБ.']);
 if(!fileIsSafe($file['tmp_name'],$ext))answer(422,['error'=>'Панель '.$panel.': файл содержит встроенные скрипты или внешние ссылки. Сохраните его заново без них.']);
 $total+=$file['size'];if($total>MAX_TOTAL)answer(413,['error'=>'Общий размер файлов превышает 100 МБ.']);
 $validated[]=['code'=>'','type'=>$type,'typeLabel'=>$TYPE_LABEL[$type],'surname'=>$surname,'first'=>$first,'patronymic'=>$patronymic,'fullname'=>$name,'number'=>$number,'rotation'=>$rotation,'zoom'=>$zoom,'offsetX'=>$offX,'offsetY'=>$offY,'placement'=>$placement,'panel'=>$panel,'photo'=>'','ext'=>$ext,'format'=>strtoupper($ext),'originalName'=>basename(str_replace('\\','/',(string)$file['name'])),'bytes'=>$file['size'],'sha256'=>hash_file('sha256',$file['tmp_name']),'tmp'=>$file['tmp_name']];
}
usort($validated,fn($a,$b)=>(int)$a['panel']<=>(int)$b['panel']);
foreach($validated as $i=>&$v){$v['code']='P'.str_pad((string)($i+1),2,'0',STR_PAD_LEFT);$v['photo']=$v['ext']!==''?$v['code'].'.'.$v['ext']:'';unset($v['ext']);}unset($v);
$logoInput=$payload['logos']??[];
if(!is_array($logoInput)||!array_is_list($logoInput)||count($logoInput)>($briefType==='photo'?20:32))answer(422,['error'=>'Превышено допустимое количество логотипов.']);
if($briefType!=='photo'&&!count($logoInput)&&$driveLink==='')answer(422,['error'=>'Добавьте логотип или ссылку на диск с логотипами.']);
$logos=[];$logoKeys=[];$logoRepeats=0;
foreach($logoInput as $i=>$entry){
 if(!is_array($entry))answer(422,['error'=>'Проверьте список логотипов.']);
 $key=$entry['key']??'';if(!is_string($key)||!preg_match('/^[1-9][0-9]{0,5}$/D',$key)||isset($logoKeys[$key]))answer(422,['error'=>'Неверная или повторяющаяся карточка логотипа.']);$logoKeys[$key]=true;
 $f=$_FILES['logo_'.$key]??null;
 if(!is_array($f)||($f['error']??-1)!==UPLOAD_ERR_OK||!is_string($f['tmp_name']??null)||!is_uploaded_file($f['tmp_name'])||$f['size']<1||$f['size']>MAX_VECTOR)answer(422,['error'=>'Загрузите логотип '.($i+1).': картинку до 10 МБ или вектор до 25 МБ.']);
 $ext=logoKind($f['tmp_name'],(string)$f['name'],$finfo);
 if(!$ext)answer(422,['error'=>'Логотип '.($i+1).': нужен JPG, PNG, WebP, PDF или вектор AI, EPS, CDR, SVG.']);
 if(!in_array($ext,VECTOR_EXT,true)&&$f['size']>MAX_FILE)answer(422,['error'=>'Логотип '.($i+1).': картинка должна быть до 10 МБ. Вектор — до 25 МБ.']);
 $total+=$f['size'];if($total>MAX_TOTAL)answer(413,['error'=>'Общий размер файлов превышает 100 МБ.']);
 $code='L'.str_pad((string)($i+1),2,'0',STR_PAD_LEFT);
 $repeats=$entry['repeats']??1;if(!is_int($repeats)||$repeats<1||$repeats>($briefType==='football-logos'?32:1000))answer(422,['error'=>'Проверьте количество повторений логотипа.']);$logoRepeats+=$repeats;
 $logos[]=['repeats'=>$repeats,'note'=>textValue($entry,'note',500),'code'=>$code,'file'=>$code.'.'.$ext,'originalName'=>basename(str_replace('\\','/',(string)$f['name'])),'bytes'=>$f['size'],'sha256'=>hash_file('sha256',$f['tmp_name']),'tmp'=>$f['tmp_name']];
}
if($briefType==='football-logos'&&$logoRepeats+count($inscriptions)>32)answer(422,['error'=>'На футбольном мяче 32 панели: уменьшите число повторений логотипов или надписей.']);
$requisites=null;
if(isset($_FILES['requisites'])&&($_FILES['requisites']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE){
 if($payment['type']!=='company')answer(422,['error'=>'Прикрепить реквизиты можно для юридического лица.']);
 $f=$_FILES['requisites'];if(!is_array($f)||($f['error']??-1)!==UPLOAD_ERR_OK||!is_string($f['tmp_name']??null)||!is_uploaded_file($f['tmp_name'])||$f['size']<1||$f['size']>MAX_FILE)answer(422,['error'=>'Не удалось загрузить реквизиты. Лимит — 10 МБ.']);
 $ext=strtolower(pathinfo((string)$f['name'],PATHINFO_EXTENSION));$mime=$finfo->file($f['tmp_name']);$valid=false;
 if(in_array($ext,['jpg','jpeg','png'],true)){$im=@getimagesize($f['tmp_name']);$valid=$im&&$im[0]*$im[1]<=50000000&&$mime===($ext==='png'?'image/png':'image/jpeg');}
 elseif($ext==='pdf'){$valid=$mime==='application/pdf'&&file_get_contents($f['tmp_name'],false,null,0,5)==='%PDF-';}
 elseif(in_array($ext,['doc','xls'],true)){$valid=in_array($mime,['application/msword','application/vnd.ms-excel','application/x-ole-storage','application/CDFV2','application/vnd.ms-office'],true)&&bin2hex(file_get_contents($f['tmp_name'],false,null,0,8))==='d0cf11e0a1b11ae1';}
 elseif(in_array($ext,['docx','xlsx'],true)&&class_exists('ZipArchive')){$z=new ZipArchive();if($z->open($f['tmp_name'])===true){$valid=$z->locateName('[Content_Types].xml')!==false&&$z->locateName($ext==='docx'?'word/document.xml':'xl/workbook.xml')!==false;$z->close();}}
 if(!$valid)answer(422,['error'=>'Реквизиты: нужен корректный PDF, DOC, DOCX, XLS, XLSX, JPG или PNG. Если Word/Excel не принимается, сохраните реквизиты в PDF.']);
 $total+=$f['size'];if($total>MAX_TOTAL)answer(413,['error'=>'Общий размер файлов превышает 100 МБ.']);
 $requisites=['file'=>'requisites.'.($ext==='jpeg'?'jpg':$ext),'originalName'=>basename(str_replace('\\','/',(string)$f['name'])),'bytes'=>$f['size'],'sha256'=>hash_file('sha256',$f['tmp_name']),'tmp'=>$f['tmp_name']];
}
$scheme=null;
if($briefType==='photo'&&isset($_FILES['scheme'])&&($_FILES['scheme']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE){
 $f=$_FILES['scheme'];
 if(is_array($f)&&($f['error']??-1)===UPLOAD_ERR_OK&&is_string($f['tmp_name']??null)&&is_uploaded_file($f['tmp_name'])&&$f['size']>0&&$f['size']<=MAX_FILE){
  $im=@getimagesize($f['tmp_name']);
  if($im&&($im['mime']??'')==='image/jpeg'&&$im[0]<=4000&&$im[1]<=4000&&$total+$f['size']<=MAX_TOTAL){$total+=$f['size'];$scheme=['file'=>'Схема-панелей.jpg','tmp'=>$f['tmp_name']];}
 }
}
$fileCount=count(array_filter($_FILES,fn($f)=>($f['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE));
if($fileCount!==$withFiles+count($logos)+($requisites?1:0)+(isset($_FILES['scheme'])&&($_FILES['scheme']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE?1:0))answer(422,['error'=>'Количество файлов не совпадает с заявкой.']);
$fingerprint=hash('sha256',json_encode([$briefType,$product,LEGAL_VERSION,$payload['privacyAccepted'],$payload['materialsConfirmed'],$order,$comments,$driveLink,$customer,$delivery,$neededDate,$payment,$requisites?array_diff_key($requisites,['tmp'=>true]):null,$inscriptions,array_map(fn($l)=>array_diff_key($l,['tmp'=>true]),$logos),array_map(fn($p)=>array_diff_key($p,['tmp'=>true]),$validated)],JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE));
// Persistent idempotency also survives a lost HTTP response or PHP restart.
$slot=$storage.'/.requests';if(!is_dir($slot)&&!mkdir($slot,0700))answer(503,['error'=>'Не удалось сохранить заявку. Попробуйте позже.']);
$requestKey=hash('sha256',$_SESSION['csrf'].':'.$requestId);
$receiptFile=$slot.'/'.$requestKey.'.json';
if(is_file($receiptFile)){$saved=json_decode((string)file_get_contents($receiptFile),true);if(($saved['fingerprint']??'')!==$fingerprint)answer(409,['error'=>'Данные изменились после отправки. Откройте форму заново для новой заявки.']);answer(200,['ok'=>true,'orderId'=>$saved['orderId']]);}
// Basic per-address hourly limit; never trust user-supplied forwarded headers.
$limdir=$storage.'/.limits';if(!is_dir($limdir))mkdir($limdir,0700);
$fh=fopen($limdir.'/'.hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown').'.json','c+');
if(!$fh||!flock($fh,LOCK_EX))answer(503,['error'=>'Приём временно недоступен. Попробуйте позже.']);
$attempts=json_decode(stream_get_contents($fh),true)?:[];$attempts=array_values(array_filter($attempts,fn($t)=>is_int($t)&&$t>time()-3600));
if(count($attempts)>=20){flock($fh,LOCK_UN);fclose($fh);answer(429,['error'=>'Слишком много заявок. Попробуйте через час или свяжитесь с менеджером.']);}
$attempts[]=time();ftruncate($fh,0);rewind($fh);fwrite($fh,json_encode($attempts));flock($fh,LOCK_UN);fclose($fh);
$id='MM-'.gmdate('Ymd').'-'.strtoupper(substr($requestKey,0,10));$final=$storage.'/'.$id;$pending=$storage.'/.pending-'.$requestKey;$written=[];
// A previous commit may have completed just before a connection/process failure.
if(is_file($final.'/order.json')){$saved=json_decode((string)file_get_contents($final.'/order.json'),true);if(($saved['fingerprint']??'')===$fingerprint)answer(200,['ok'=>true,'orderId'=>$id]);answer(409,['error'=>'Повторная отправка содержит другие данные.']);}
try{
 if(!mkdir($pending,0700))throw new RuntimeException('pending');
 foreach($validated as &$person){if($person['photo']===''){$person['preview']=null;unset($person['tmp']);continue;}$dest=$pending.'/'.$person['photo'];if(!move_uploaded_file($person['tmp'],$dest))throw new RuntimeException('upload');$written[]=$dest;chmod($dest,0600);unset($person['tmp']);
  $person['preview']=null;if(in_array(pathinfo($dest,PATHINFO_EXTENSION),['jpg','png','webp'],true)){$pv=$pending.'/'.$person['code'].'-mini.jpg';try{if(makePreview($dest,$pv)){chmod($pv,0600);$written[]=$pv;$person['preview']=basename($pv);}}catch(Throwable $e){}}}unset($person);
 foreach($logos as &$logo){$dest=$pending.'/'.$logo['file'];if(!move_uploaded_file($logo['tmp'],$dest))throw new RuntimeException('logo upload');$written[]=$dest;chmod($dest,0600);unset($logo['tmp']);}unset($logo);
 if($requisites){$dest=$pending.'/'.$requisites['file'];if(!move_uploaded_file($requisites['tmp'],$dest))throw new RuntimeException('requisites upload');$written[]=$dest;chmod($dest,0600);unset($requisites['tmp']);}
 if($scheme){$dest=$pending.'/'.$scheme['file'];if(move_uploaded_file($scheme['tmp'],$dest)){$written[]=$dest;chmod($dest,0600);}else{$scheme=null;}}
 $data=['briefType'=>$briefType,'product'=>$product,'orderId'=>$id,'createdAt'=>gmdate('c'),'order'=>$order,'comments'=>$comments,'driveLink'=>$driveLink,'customer'=>$customer,'delivery'=>$delivery,'neededDate'=>$neededDate,'payment'=>$payment,'requisites'=>$requisites,'productionTerms'=>$productionTerms,'inscription'=>$inscription,'inscriptions'=>$inscriptions,'logos'=>$logos,'confirmed'=>true,'fingerprint'=>$fingerprint,'layout'=>$layout,'players'=>$validated,'scheme'=>$scheme?$scheme['file']:null];
 $data['legal']=['privacyAccepted'=>true,'materialsConfirmed'=>true,'version'=>LEGAL_VERSION,'acceptedAt'=>$data['createdAt']];
 $evidence=['orderId'=>$id,'confirmation'=>$data['legal'],'documents'=>[]];
 foreach(['privacy','consent','materials'] as $document){
  $contents=file_get_contents(__DIR__.'/legal/'.$document.'.html');
  if($contents===false)throw new RuntimeException('legal document missing');
  $evidence['documents'][$document]=['sha256'=>hash('sha256',$contents),'html'=>$contents];
 }
 storeFile($pending.'/consent-evidence.json',json_encode($evidence,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));$written[]=$pending.'/consent-evidence.json';
 $json=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);
 storeFile($pending.'/order.json',$json);$written[]=$pending.'/order.json';
 $brief="МОЙ МЯЧ — МАТЕРИАЛЫ ЗАКАЗА\nЗаявка: $id\nДата (UTC): ".$data['createdAt']."\nКоманда / заказ: $order\n\nЗАКАЗЧИК\nФИО: {$customer['fullname']}\nТелефон: {$customer['phone']}\nEmail: {$customer['email']}\nTelegram: {$customer['telegram']}\nMAX: {$customer['max']}\nВК: {$customer['vk']}\n\nПОЛУЧЕНИЕ И ОПЛАТА\nСпособ получения: ".($delivery['method']==='cdek'?'СДЭК':'Самовывоз')."\nАдрес: {$delivery['address']}\nКогда нужен мяч: $neededDate\n$productionTerms\nПлательщик: ".($payment['type']==='company'?'Юридическое лицо':'Физическое лицо')."\nОрганизация: {$payment['companyName']}\nПромокод: ".($payment['promo']!==''?$payment['promo']:'нет')."\nРеквизиты: ".($requisites['file']??'не прикреплены')."\n\nНАДПИСИ НА МЯЧЕ\n$inscription\n\nРАСКЛАДКА МЯЧА\n".($scheme?"Картинка раскладки: Схема-панелей.jpg\n":'');
 $brief.="Схема мяча: ".($layout==='groups'?'30 панелей (33 = 2+3, 35 = 18+19)':'32 панели')."\nЗаполнено панелей: ".count($validated)."\n";
 foreach($validated as $p){$brief.="\nПанель {$p['panel']}".($p['panel']==='22'?' (с ниппелем)':'')." | ".($p['code']!==''?$p['code'].' | ':'')."{$p['typeLabel']} | Фамилия имя или текст: ".($p['fullname']!==''?$p['fullname']:'—')." | Номер: ".($p['number']!==''?$p['number']:'—').($p['placement']!==''?" | Положение: ".$p['placement']:(!empty($p['rotation'])?" | Повернуть: ".abs($p['rotation'])."° ".($p['rotation']>0?'по часовой':'против часовой'):''))."\n".($p['photo']!==''?"Файл: {$p['photo']} ({$p['format']}, исходное имя: {$p['originalName']})":"Файл: нет — на панели только текст")."\n";}
 if($product){$brief.="\nБРИФ НА МЯЧ С ЛОГОТИПАМИ\nТип: ".($briefType==='football-logos'?'Футбольный':'Баскетбольный')."\nМодель: {$product['title']}\nКарточка: {$product['url']}\nРазмер: {$product['size']}\nКоличество мячей: {$product['quantity']}\nЦвета: {$product['colors']}\nРасположение: {$product['placement']}\nМодель из каталога: {$product['modelReference']}\nСпособ нанесения: {$product['printingLabel']}\nМатериал: {$product['materialLabel']}\nPantone / образец: {$product['materialColor']}\nТиснение: {$product['embossing']}\n";}
 $brief.="\nКОММЕНТАРИИ\n".($comments!==''?$comments:'Не указаны')."\n\nССЫЛКА НА ОБЛАЧНЫЙ ДИСК\n".($driveLink!==''?$driveLink:'Не указана')."\n";
 $brief.="\nЛОГОТИПЫ\n";if(!$logos)$brief.="Не прикреплены\n";foreach($logos as $logo){$brief.="{$logo['code']} | {$logo['originalName']}\nФайл: {$logo['file']}\nПовторений на одном мяче: {$logo['repeats']}\nПожелания: {$logo['note']}\n";}
 $brief.="\nПОДТВЕРЖДЕНИЯ\nСогласие на обработку собственных персональных данных: да\nЗаконные основания передачи материалов подтверждены заказчиком: да\nРедакция документов: ".LEGAL_VERSION."\nДата (UTC): ".$data['createdAt']."\n\nПодтверждение заказчика не заменяет согласия третьих лиц и законных представителей, когда они необходимы.\n";
 storeFile($pending.'/Задание.txt',"\xEF\xBB\xBF".$brief);$written[]=$pending.'/Задание.txt';
 if(!rename($pending,$final))throw new RuntimeException('commit');
 // The committed folder is the source of truth even if the retry index cannot be written.
 try{storeFile($receiptFile,json_encode(['orderId'=>$id,'fingerprint'=>$fingerprint],JSON_THROW_ON_ERROR));}catch(Throwable $e){error_log('MoyMyach: retry index write failed');}
 // Email failure must not affect the already committed order.
 try { require_once __DIR__.'/mail-notify.php'; moymyachNotify($storage,$final,$data); }
 catch(Throwable $e) { error_log('MoyMyach: notification module unavailable'); }
 answer(201,['ok'=>true,'orderId'=>$id]);
}catch(Throwable $e){foreach($written as $path){if(is_file($path))unlink($path);}if(is_dir($pending))@rmdir($pending);error_log('MoyMyach: order write failed');answer(503,['error'=>'Не удалось сохранить материалы. Попробуйте отправить ещё раз или обратитесь к менеджеру.']);}
