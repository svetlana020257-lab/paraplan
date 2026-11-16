package ru.paraplan.kassa;

/**
 * Плитка «Клиенты» на Эвоторе: заказы под клиента для точки.
 * Работает как касса: сначала свежая страница с GitHub Pages, без интернета — копия в приложении.
 */
public class ClientsActivity extends MainActivity {
    @Override
    protected String onlineUrl() { return "https://svetlana020257-lab.github.io/paraplan/clients.html"; }

    @Override
    protected String offlineUrl() { return "file:///android_asset/clients.html"; }
}
