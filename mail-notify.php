<?php
declare(strict_types=1);
// Not an HTTP endpoint. Credentials are loaded only from private order storage.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
require_once __DIR__.'/vendor/phpmailer/Exception.php';
require_once __DIR__.'/vendor/phpmailer/SMTP.php';
require_once __DIR__.'/vendor/phpmailer/PHPMailer.php';

function moymyachBuildMail(array $config, array $order): \PHPMailer\PHPMailer\PHPMailer {
    $address='moymyach@mail.ru';
    $password=$config['password']??'';
    if (!is_string($password)||trim($password)===''||$password==='PASTE_APP_PASSWORD_HERE') {
        throw new RuntimeException('missing_password');
    }
    $mail=new \PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host='smtp.mail.ru';
    $mail->Port=465;
    $mail->SMTPSecure=\PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    $mail->SMTPAuth=true;
    $mail->Username=$address;
    $mail->Password=$password;
    $mail->SMTPDebug=0;
    $mail->Timeout=8;
    $mail->getSMTPInstance()->Timelimit=15;
    $mail->CharSet='UTF-8';
    $mail->setFrom($address,'Мой мяч — заказы');
    $mail->addAddress($address);
    $mail->Subject='Новая заявка на мяч — '.$order['orderId'];
    $mail->MessageID='<'.strtolower($order['orderId']).'@3dmoymyach.ru>';
    $customer=$order['customer'];
    $mail->Body="Новая заявка: {$order['orderId']}\n\n".
        "Заказчик: {$customer['fullname']}\nТелефон: {$customer['phone']}\n".
        "Email: ".($customer['email']??'')."\nКогда нужен мяч: {$order['neededDate']}\n".
        "Команда / заказ: {$order['order']}\n".
        "Получение: ".($order['delivery']['method']==='pickup'?'Самовывоз':'СДЭК')."\n".
        (!empty($order['payment']['promo'])?"ПРОМОКОД: {$order['payment']['promo']}\n":'').
        "Фотографий: ".count($order['players'])."\nЛоготипов: ".count($order['logos'])."\n\n".
        "Комментарии:\n".($order['comments']?:'Не указаны')."\n\n".
        "Все материалы и Задание.txt сохранены на хостинге:\n".
        "moymyach-orders/{$order['orderId']}/\n\n".
        "Откройте эту папку через менеджер файлов ispmanager.\n";
    if (!empty($order['product'])) {
        $product=$order['product'];
        $mail->Subject='Бриф: '.$product['title'].' — '.$order['orderId'];
        $mail->Body.="\nМодель: {$product['title']}\nРазмер: {$product['size']}\nКоличество мячей: {$product['quantity']}\nЦвета: {$product['colors']}\nРасположение: {$product['placement']}\nСпособ нанесения: {$product['printingLabel']}\nМатериал: {$product['materialLabel']}\nPantone / образец: {$product['materialColor']}\nТиснение: {$product['embossing']}\n";
    }
    if (!empty($order['downloadUrl'])) {
        $mail->Body.="\nСкачать архив заказа:\n".$order['downloadUrl']."\n\nСсылка работает, пока материалы заказа хранятся на сервере. Любой, у кого есть эта ссылка, сможет скачать материалы.\n";
    }
    return $mail;
}

// Контакты фабрики — в письме клиенту.
const MOYMYACH_CONTACTS=[
    ['Телефон','+7 (499) 290-79-28','tel:+74992907928'],
    ['Почта','moymyach@mail.ru','mailto:moymyach@mail.ru'],
    ['Telegram','@moymyach','https://t.me/moymyach'],
    ['ВКонтакте','vk.ru/moymyach','https://vk.ru/moymyach'],
    ['MAX','Написать в MAX','https://max.ru/u/f9LHodD0cOLhce6qlzY8PDAWNGWKOXteOUejsyzeLoEl7tlQ4YE5VmTmf40'],
];

// Письмо клиенту: номер заказа, ссылка на архив его материалов, что будет дальше.
function moymyachBuildCustomerMail(array $config, array $order): \PHPMailer\PHPMailer\PHPMailer {
    $address='moymyach@mail.ru';
    $mail=new \PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host='smtp.mail.ru';
    $mail->Port=465;
    $mail->SMTPSecure=\PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    $mail->SMTPAuth=true;
    $mail->Username=$address;
    $mail->Password=(string)($config['password']??'');
    $mail->SMTPDebug=0;
    $mail->Timeout=8;
    $mail->getSMTPInstance()->Timelimit=15;
    $mail->CharSet='UTF-8';
    $mail->setFrom($address,'Фабрика «Мой мяч»');
    $mail->addReplyTo($address,'Фабрика «Мой мяч»');
    $mail->addAddress($order['customer']['email'],$order['customer']['fullname']);
    $id=$order['orderId'];
    $mail->Subject='Заявка '.$id.' принята — Фабрика «Мой мяч»';
    $mail->MessageID='<'.strtolower($id).'-client@3dmoymyach.ru>';
    $ball=!empty($order['product'])?$order['product']['title'].', размер '.$order['product']['size'].', '.$order['product']['quantity'].' шт.':'Футбольный мяч с фото';
    $files=count($order['players'])+count($order['logos']);
    $h=fn($v)=>htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');
    $steps=['Дизайнер подготовит макет за 1 рабочий день и пришлёт его на согласование.','Ссылку на оплату пришлёт менеджер.',$order['productionTerms']??'Производство начнётся после утверждения макета и оплаты.'];
    $text="Здравствуйте, {$order['customer']['fullname']}!\n\nМы получили вашу заявку.\nНомер заявки: {$id}\nМяч: {$ball}\nФайлов в заявке: {$files}\n\n";
    if(!empty($order['downloadUrl']))$text.="Ваши материалы одним архивом:\n{$order['downloadUrl']}\n\n";
    $text.="Что дальше:\n";foreach($steps as $i=>$st)$text.=($i+1).'. '.$st."\n";
    $text.="\nЕсли нужно что-то уточнить или добавить, ответьте на это письмо или напишите нам и назовите номер заявки {$id}.\n\n";
    foreach(MOYMYACH_CONTACTS as [$k,$v,$u])$text.="{$k}: ".($k==='MAX'?$u:$v)."\n";
    $text.="\nФабрика «Мой мяч» · moymyach.ru\n";
    $html='<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#17171b;max-width:560px">'
        .'<p>Здравствуйте, '.$h($order['customer']['fullname']).'!</p>'
        .'<p>Мы получили вашу заявку.</p>'
        .'<p style="font-size:14px;color:#5a5a63;margin:0">Номер заявки</p><p style="font-size:26px;font-weight:bold;color:#c20e2c;margin:4px 0 16px">'.$h($id).'</p>'
        .'<p style="margin:0 0 4px"><b>Мяч:</b> '.$h($ball).'</p><p style="margin:0 0 16px"><b>Файлов в заявке:</b> '.$files.'</p>'
        .(!empty($order['downloadUrl'])?'<p><a href="'.$h($order['downloadUrl']).'" style="display:inline-block;background:#c20e2c;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px">Скачать архив с материалами</a></p>':'')
        .'<p style="margin:20px 0 6px"><b>Что дальше</b></p><ol style="margin:0 0 16px;padding-left:20px">';
    foreach($steps as $st)$html.='<li>'.$h($st).'</li>';
    $html.='</ol><p>Если нужно что-то уточнить или добавить, ответьте на это письмо или напишите нам и назовите номер заявки <b>'.$h($id).'</b>.</p><p style="font-size:14px;line-height:1.7">';
    foreach(MOYMYACH_CONTACTS as [$k,$v,$u])$html.=$h($k).': <a href="'.$h($u).'" style="color:#c20e2c">'.$h($v).'</a><br>';
    $html.='</p><p style="font-size:13px;color:#77767c">Фабрика «Мой мяч» · <a href="https://moymyach.ru/" style="color:#77767c">moymyach.ru</a></p></div>';
    $mail->isHTML(true);
    $mail->Body=$html;
    $mail->AltBody=$text;
    return $mail;
}

function moymyachNotify(string $storage, string $folder, array $order, ?callable $send=null): void {
    // Never turn a saved order into a failed order because of email.
    $status=['status'=>'not_configured','customer'=>'not_configured','updatedAt'=>gmdate('c')];
    $config=null;
    try {
        $file=$storage.'/mail-config.json';
        $resolved=realpath($file);
        $root=realpath($_SERVER['DOCUMENT_ROOT']??'');
        if ($resolved && (!$root || inside($resolved,$root))) throw new RuntimeException('unsafe_config');
        if ($resolved) {
            $config=json_decode((string)file_get_contents($resolved),true,16,JSON_THROW_ON_ERROR);
            if (!is_array($config)) throw new RuntimeException('invalid_config');
            if (($config['enabled']??false)===true) {
                // Одна ссылка на архив — для менеджера и для клиента.
                $downloadToken=bin2hex(random_bytes(32));
                storeFile($folder.'/.download.json',json_encode(['hash'=>hash('sha256',$downloadToken)],JSON_THROW_ON_ERROR));
                $order['downloadUrl']='https://3dmoymyach.ru/order/download.php?order='.rawurlencode($order['orderId']).'&token='.$downloadToken;
                $mail=moymyachBuildMail($config,$order);
                if ($send ? !$send($mail) : !$mail->send()) throw new RuntimeException('smtp_failed');
                $status['status']='sent';
            } else { $config=null; }
        }
    } catch (Throwable $e) {
        $status['status']='failed';
        // SMTP transcripts may contain credentials; do not store raw exceptions.
        $status['message']='Письмо не отправлено. Проверьте пароль приложения, настройки файла mail-config.json и доступ хостинга к smtp.mail.ru:465. Заказ сохранён.';
        error_log('MoyMyach: email notification failed for '.$order['orderId']);
    }
    // Письмо клиенту отправляется отдельно: его сбой не влияет ни на заказ, ни на письмо менеджеру.
    if (is_array($config) && !empty($order['downloadUrl']) && filter_var($order['customer']['email']??'',FILTER_VALIDATE_EMAIL)) {
        try {
            $client=moymyachBuildCustomerMail($config,$order);
            if ($send ? !$send($client) : !$client->send()) throw new RuntimeException('smtp_failed');
            $status['customer']='sent';
        } catch (Throwable $e) {
            $status['customer']='failed';
            error_log('MoyMyach: customer email failed for '.$order['orderId']);
        }
    }
    try { storeFile($folder.'/notification.json',json_encode($status,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)); }
    catch(Throwable $e) { error_log('MoyMyach: notification status write failed'); }
}
