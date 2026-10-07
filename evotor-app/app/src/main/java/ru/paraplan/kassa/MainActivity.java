package ru.paraplan.kassa;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * «Параплан Касса» для смарт-терминала Эвотор.
 * Открывает кассу с GitHub Pages (так её можно обновлять без переустановки).
 * Если сети нет при запуске — открывает копию кассы, вшитую в приложение;
 * чеки копятся в очереди и уходят в таблицу, когда связь вернётся.
 */
public class MainActivity extends Activity {

    private static final String ONLINE = "https://svetlana020257-lab.github.io/paraplan/kassa.html";
    private static final String OFFLINE = "file:///android_asset/kassa.html";

    private WebView web;
    private boolean fellBack = false;

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
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        web.setWebViewClient(new WebViewClient() {
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
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(ONLINE);
    }

    private void fallback() {
        if (fellBack) return;
        fellBack = true;
        web.loadUrl(OFFLINE);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // назад внутри кассы: закрыть открытое окно оплаты/итога
        web.evaluateJavascript(
            "(function(){var o=[].slice.call(document.querySelectorAll('.scrim')).filter(function(s){return !s.hidden});" +
            "if(o.length){o.forEach(function(s){s.hidden=true});return 1}return 0})()",
            v -> { if ("0".equals(v)) MainActivity.super.onBackPressed(); });
    }
}
