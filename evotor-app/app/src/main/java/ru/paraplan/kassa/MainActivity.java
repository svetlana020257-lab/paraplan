package ru.paraplan.kassa;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * «Параплан Касса» для смарт-терминала Эвотор.
 * Сначала пробует открыть свежую кассу с GitHub Pages. Если за 8 секунд
 * страница не открылась, или ошибка сети/сертификата — открывает копию кассы,
 * вшитую в приложение. Чеки в любом случае уходят в таблицу.
 */
public class MainActivity extends Activity {

    private static final String ONLINE = "https://svetlana020257-lab.github.io/paraplan/kassa.html";
    private static final String OFFLINE = "file:///android_asset/kassa.html";
    private static final long TIMEOUT_MS = 8000;

    private WebView web;
    private boolean fellBack = false;
    private boolean onlineLoaded = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);   // всегда свежая версия кассы
        s.setTextZoom(100);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(ONLINE)) onlineLoaded = true;
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler h, SslError error) {
                // старый терминал не доверяет сертификату сайта — работаем с копией в приложении
                h.cancel();
                fallback();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && req.isForMainFrame()) fallback();
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int code, String desc, String url) {
                if (url != null && url.startsWith(ONLINE)) fallback();
            }
        });

        setContentView(web);
        web.loadUrl(ONLINE);
        handler.postDelayed(() -> { if (!onlineLoaded) fallback(); }, TIMEOUT_MS);
    }

    private void fallback() {
        if (fellBack || onlineLoaded) return;
        fellBack = true;
        web.stopLoading();
        web.loadUrl(OFFLINE);
    }

    private boolean backAnswered;

    @Override
    public void onBackPressed() {
        // «Назад» закрывает открытое окно кассы; если окон нет или страница не отвечает — выходим
        backAnswered = false;
        web.evaluateJavascript(
            "(function(){var o=[].slice.call(document.querySelectorAll('.scrim')).filter(function(s){return getComputedStyle(s).display!=='none'});" +
            "if(o.length){o.forEach(function(s){s.hidden=true});return 1}return 0})()",
            v -> { backAnswered = true; if (!"1".equals(v)) finish(); });
        handler.postDelayed(() -> { if (!backAnswered) finish(); }, 400);
    }

    @Override
    protected void onStop() {
        super.onStop();
        // при уходе с экрана закрываем кассу — следующий запуск откроет свежую версию
        if (!isChangingConfigurations()) finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
