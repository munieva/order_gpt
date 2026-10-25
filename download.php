<?php
declare(strict_types=1);
ini_set('display_errors','0');
header('Cache-Control: private, no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
function stopDownload(int $code,string $message):never{http_response_code($code);header('Content-Type: text/plain; charset=utf-8');exit($message);}
function inDirectory(string $p,string $root):bool{$p=str_replace('\\','/',$p);$root=rtrim(str_replace('\\','/',$root),'/');if(PHP_OS_FAMILY==='Windows'){$p=strtolower($p);$root=strtolower($root);}return $p===$root||str_starts_with($p,$root.'/');}
if(!in_array($_SERVER['REQUEST_METHOD']??'GET',['GET','HEAD'],true))stopDownload(405,'Метод не поддерживается.');
$id=$_GET['order']??'';$token=$_GET['token']??'';
if(!is_string($id)||!preg_match('/^MM-[0-9]{8}-[A-F0-9]{10}$/D',$id)||!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))stopDownload(404,'Ссылка недействительна.');
$temporary=null;$zip=null;
try{
 $storage=getenv('MOYMYACH_STORAGE_DIR');
 if(!$storage){
  // This package is installed at HOME/www/3dmoymyach.ru/order/.
  // Keep customer files outside the entire public www directory.
  if(basename(__DIR__)!=='order'||basename(dirname(__DIR__))!=='3dmoymyach.ru'||basename(dirname(__DIR__,2))!=='www')throw new RuntimeException('unexpected installation directory');
  $storage=dirname(__DIR__,3).'/moymyach-orders';
 }
 $storage=realpath($storage);$root=realpath($_SERVER['DOCUMENT_ROOT']??'');
 if(!$storage||!$root||inDirectory($storage,$root)||inDirectory($storage,__DIR__))throw new RuntimeException('storage');
 $folder=realpath($storage.'/'.$id);
 if(!$folder||dirname($folder)!==$storage)stopDownload(404,'Ссылка недействительна.');
 $authPath=$folder.'/.download.json';
 if(!is_file($authPath)||is_link($authPath))stopDownload(404,'Ссылка недействительна.');
 $auth=json_decode((string)file_get_contents($authPath),true);
 if(!is_array($auth)||!is_string($auth['hash']??null)||!hash_equals($auth['hash'],hash('sha256',$token)))stopDownload(404,'Ссылка недействительна.');
 // Legacy expires fields are deliberately ignored: links last until order deletion.
 if(!class_exists('ZipArchive'))throw new RuntimeException('zip');
 $dataPath=$folder.'/order.json';if(is_link($dataPath))throw new RuntimeException('data');
 $data=json_decode((string)file_get_contents($dataPath),true,64,JSON_THROW_ON_ERROR);
 $names=['Задание.txt'];
 foreach($data['players'] as $p){if(($p['photo']??'')!=='')$names[]=$p['photo'];if(!empty($p['preview']))$names[]=$p['preview'];}
 foreach($data['logos']??[] as $logo)$names[]=$logo['file'];
 if(!empty($data['requisites']['file']))$names[]=$data['requisites']['file'];
 if(($data['scheme']??null)==='Схема-панелей.jpg')$names[]='Схема-панелей.jpg';
 // Explicit allowlist: never include mail credentials, tokens or service files.
 foreach($names as $name){
  if(!is_string($name)||($name!=='Задание.txt'&&$name!=='Схема-панелей.jpg'&&!preg_match('/^(?:P[0-9]{2}\.(?:jpg|png|webp|pdf|ai|eps|cdr|svg)|P[0-9]{2}-mini\.jpg|L[0-9]{2}\.(?:jpg|png|webp|pdf|ai|eps|cdr|svg)|requisites\.(?:pdf|docx?|xlsx?|jpg|png))$/D',$name)))throw new RuntimeException('filename');
  $file=realpath($folder.'/'.$name);if(!$file||dirname($file)!==$folder||is_link($folder.'/'.$name)||!is_file($file))throw new RuntimeException('missing file');
 }
 if(($_SERVER['REQUEST_METHOD']??'GET')==='HEAD'){header('Content-Type: application/zip');exit;}
 $temporary=tempnam($storage,'.zip-');if(!$temporary)throw new RuntimeException('temp');chmod($temporary,0600);
 register_shutdown_function(static function()use(&$temporary){if($temporary&&is_file($temporary))@unlink($temporary);});
 $zip=new ZipArchive();if($zip->open($temporary,ZipArchive::OVERWRITE)!==true)throw new RuntimeException('open zip');
 foreach($names as $name){if(!$zip->addFile($folder.'/'.$name,$id.'/'.(preg_match('/-mini\.jpg$/',$name)?'превью/':'').$name))throw new RuntimeException('add zip');}
 if(!$zip->close())throw new RuntimeException('close zip');$zip=null;
 header('Content-Type: application/zip');header('Content-Disposition: attachment; filename="'.$id.'.zip"');header('Content-Length: '.filesize($temporary));
 readfile($temporary);unlink($temporary);$temporary=null;
}catch(Throwable $e){if($zip instanceof ZipArchive){@$zip->close();}if($temporary&&is_file($temporary))@unlink($temporary);error_log('MoyMyach: archive download failed');stopDownload(503,'Не удалось собрать архив. Обратитесь к менеджеру. Заказ сохранён.');}
