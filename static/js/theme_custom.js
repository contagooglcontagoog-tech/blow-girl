/**
 * theme_custom.js — STUB para clone estático do blowgirl.com.br
 * O HTML já foi capturado com todos os elementos criados pelo JS original.
 * Este stub evita que o JS recrie esses elementos e cause duplicações.
 */
(function ($) {
    'use strict';

    if (!$ || !$.fn) return;

    // Stub dos plugins que causariam duplicação ou reinicialização
    $.fn.slick = function () { return this; };
    $.fn.fancybox = function () { return this; };
    $.fn.autocomplete = function () { return this; };

    $(document).ready(function () {

        // === MENU MOBILE TOGGLE ===
        $('.menu-mobile-button, .hamburger').on('click', function () {
            $('.menu-mobile').addClass('active');
            $('body').addClass('menu-aberto');
        });
        $('.menu-mobile-close').on('click', function () {
            $('.menu-mobile').removeClass('active');
            $('body').removeClass('menu-aberto');
        });

        // === COOKIE CONSENT ===
        $('.fechar-aviso-cookie, .botao-aviso-cookie').on('click', function () {
            $('.aviso-cookie').fadeOut(300);
        });

        // === RASTREIO RÁPIDO ===
        $('.rastrear-pedido').on('click', function () {
            $(this).closest('.lista-rastrear').find('.rastreio-pedido').slideToggle(200);
        });

        // === BUSCA ===
        $('#form-buscar').on('submit', function (e) {
            var q = $(this).find('input[name="q"]').val();
            if (!q) e.preventDefault();
        });

        // === ACCORDION MENU MOBILE ===
        $('.menu-mobile .nivel-um > li.submenu2 > a').on('click', function () {
            var li = $(this).parent();
            li.toggleClass('open');
        });

        // === REMOVER LOADING ===
        if (typeof removePageLoading === 'function') removePageLoading();
        $('body').removeClass('pagina-carregando');
        $('#page-loading, .page-loading').remove();

    });

}(typeof jQuery !== 'undefined' ? jQuery : null));
