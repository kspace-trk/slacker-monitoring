import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';

dotenv.config();

// Discord Webhook URL
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

// ファイルパス
const screenshotsDir = './screenshots';
const currentScreenshotPath = path.join(screenshotsDir, 'current.png');
const previousScreenshotPath = path.join(screenshotsDir, 'previous.png');
const croppedCurrentPath = path.join(screenshotsDir, 'current_cropped.png');
const croppedPreviousPath = path.join(screenshotsDir, 'previous_cropped.png');

// 右上のトリミング設定（時計などのUI変化を無視するため）
const TRIM_WIDTH = 170;
const TRIM_HEIGHT = 30;

// 連続警告のカウンター
let consecutiveWarningCount = 0;
const MAX_CONSECUTIVE_WARNINGS = 3;

/**
 * スクリーンショットディレクトリを作成
 */
const ensureDirectoryExists = () => {
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
};

/**
 * screencaptureコマンドでスクリーンショットを取得
 */
const takeScreenshot = (outputPath) => {
  return new Promise((resolve, reject) => {
    exec(`screencapture -x "${outputPath}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

/**
 * 画像の右上部分をトリミング
 */
const cropRightTop = async (inputPath, outputPath) => {
  try {
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;

    // 右上の領域をトリミング（除外するため、右上を取り除いた部分を保存）
    await sharp(inputPath)
      .extract({
        left: 0,
        top: 0,
        width: width - TRIM_WIDTH,
        height: height
      })
      .extract({
        left: 0,
        top: TRIM_HEIGHT,
        width: width - TRIM_WIDTH,
        height: height - TRIM_HEIGHT
      })
      .png()
      .toFile(outputPath);
  } catch (error) {
    console.error('トリミングエラー:', error);
    throw error;
  }
};

/**
 * 2つのPNG画像を比較
 */
const compareImages = (path1, path2) => {
  return new Promise((resolve, reject) => {
    const img1 = fs.createReadStream(path1).pipe(new PNG());
    const img2 = fs.createReadStream(path2).pipe(new PNG());

    let img1Data, img2Data;
    let completed = 0;

    const checkComplete = () => {
      completed++;
      if (completed === 2) {
        if (img1Data.width !== img2Data.width || img1Data.height !== img2Data.height) {
          resolve(1); // サイズが違う場合は差分ありとみなす
          return;
        }

        const diffPixels = pixelmatch(
          img1Data.data,
          img2Data.data,
          null,
          img1Data.width,
          img1Data.height,
          { threshold: 0.0 }
        );

        resolve(diffPixels);
      }
    };

    img1.on('parsed', function () {
      img1Data = this;
      checkComplete();
    });

    img2.on('parsed', function () {
      img2Data = this;
      checkComplete();
    });

    img1.on('error', reject);
    img2.on('error', reject);
  });
};

/**
 * Discord Webhookにメッセージを送信
 */
const sendDiscordMessage = async (message) => {
  try {
    const response = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message
      })
    });

    if (!response.ok) {
      throw new Error(`Discord API エラー: ${response.status}`);
    }

    console.log('Discord通知を送信しました:', message);
  } catch (error) {
    console.error('Discord通知の送信に失敗しました:', error);
  }
};

/**
 * メイン処理
 */
const monitor = async () => {
  try {
    console.log('スクリーンショットを取得中...');

    // 新しいスクリーンショットを取得
    await takeScreenshot(currentScreenshotPath);

    // 右上部分をトリミング
    await cropRightTop(currentScreenshotPath, croppedCurrentPath);

    // 前回のスクリーンショットが存在するかチェック
    if (fs.existsSync(croppedPreviousPath)) {
      console.log('画像を比較中...');

      // 画像を比較
      const diffPixels = await compareImages(croppedCurrentPath, croppedPreviousPath);

      console.log(`差分ピクセル数: ${diffPixels}`);

      if (diffPixels === 0) {
        consecutiveWarningCount++;
        console.log(`⚠️ カーソルが動いていません！(連続${consecutiveWarningCount}回目)`);
        
        if (consecutiveWarningCount <= MAX_CONSECUTIVE_WARNINGS) {
            await sendDiscordMessage('⚠️ keigoのカーソルが 3分間動いていません。サボっている可能性があります。');
            
            if (consecutiveWarningCount === MAX_CONSECUTIVE_WARNINGS) {
                console.log(`🛑 連続警告が${MAX_CONSECUTIVE_WARNINGS}回に達しました。プロセスを終了します。`);
                await sendDiscordMessage('🛑 連続3回の警告によりシステムを停止しました。');
                process.exit(0);
            }
        }
      } else {
        console.log('✅ 画面に変化がありました');
        if (consecutiveWarningCount > 0) {
            console.log('🔄 警告カウンターをリセットしました');
            consecutiveWarningCount = 0;
        }
      }
    } else {
      console.log('初回実行 - 次回から比較を開始します');
    }

    // 現在の画像を前回の画像として保存
    if (fs.existsSync(croppedCurrentPath)) {
      fs.copyFileSync(croppedCurrentPath, croppedPreviousPath);
    }

  } catch (error) {
    console.error('監視処理でエラーが発生しました:', error);
  }
};

/**
 * アプリケーション開始
 */
const start = () => {
  console.log('スクリーンショット監視を開始します...');

  // 環境変数のチェック
  if (!discordWebhookUrl) {
    console.error('❌ エラー: DISCORD_WEBHOOK_URL環境変数が設定されていません');
    console.error('使用方法: DISCORD_WEBHOOK_URL=your_webhook_url npm start');
    process.exit(1);
  }

  console.log(`Discord Webhook URL: ${discordWebhookUrl.substring(0, 50)}...`);

  ensureDirectoryExists();

  // 即座に1回実行
  monitor();

  // 3分ごとに実行
  setInterval(monitor, 3 * 60 * 1000);
};

// アプリケーション開始
start(); 