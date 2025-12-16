/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunkworkspace_client"] = self["webpackChunkworkspace_client"] || []).push([["public_assets_js_modules_agenda_AgendaInit_js"],{

/***/ "./public/assets/js/modules/agenda lazy recursive ^\\.\\/agenda\\.js\\?t=.*$":
/*!***************************************************************************************!*\
  !*** ./public/assets/js/modules/agenda/ lazy ^\.\/agenda\.js\?t=.*$ namespace object ***!
  \***************************************************************************************/
/***/ ((module) => {

function webpackEmptyAsyncContext(req) {
	// Here Promise.resolve().then() is used instead of new Promise() to prevent
	// uncaught exception popping up in devtools
	return Promise.resolve().then(() => {
		var e = new Error("Cannot find module '" + req + "'");
		e.code = 'MODULE_NOT_FOUND';
		throw e;
	});
}
webpackEmptyAsyncContext.keys = () => ([]);
webpackEmptyAsyncContext.resolve = webpackEmptyAsyncContext;
webpackEmptyAsyncContext.id = "./public/assets/js/modules/agenda lazy recursive ^\\.\\/agenda\\.js\\?t=.*$";
module.exports = webpackEmptyAsyncContext;

/***/ }),

/***/ "./public/assets/js/modules/agenda/AgendaInit.js":
/*!*******************************************************!*\
  !*** ./public/assets/js/modules/agenda/AgendaInit.js ***!
  \*******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   destroyAgenda: () => (/* binding */ destroyAgenda),\n/* harmony export */   initAgenda: () => (/* binding */ initAgenda),\n/* harmony export */   isAgendaInitialized: () => (/* binding */ isAgendaInitialized)\n/* harmony export */ });\n/**\n * AgendaInit.js - Gestionnaire d'initialisation/cleanup pour l'agenda\n * Permet de charger et décharger l'agenda de manière propre\n */\n\nlet agendaModule = null;\nlet agendaInitialized = false;\n\nasync function initAgenda() {\n    try {\n        // Éviter les doubles initialisations\n        if (agendaInitialized) {\n            console.log('⚠️ Agenda déjà initialisé');\n            return;\n        }\n\n        // Charger le module agenda.js dynamiquement\n        // Ajouter un timestamp pour forcer le rechargement du cache\n        const timestamp = new Date().getTime();\n        agendaModule = await __webpack_require__(\"./public/assets/js/modules/agenda lazy recursive ^\\\\.\\\\/agenda\\\\.js\\\\?t=.*$\")(`./agenda.js?t=${timestamp}`);\n        \n        agendaInitialized = true;\n    } catch (error) {\n        console.error('❌ Erreur lors de l\\'initialisation de l\\'agenda:', error);\n    }\n}\n\nfunction destroyAgenda() {\n    try {\n        // Nettoyer les références\n        agendaModule = null;\n        agendaInitialized = false;\n        \n        // Nettoyer les event listeners si nécessaire\n        // (agenda.js gérera son propre cleanup s'il y a une fonction destroy)\n    } catch (error) {\n        console.error('❌ Erreur lors de la destruction de l\\'agenda:', error);\n    }\n}\n\nfunction isAgendaInitialized() {\n    return agendaInitialized;\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiLi9wdWJsaWMvYXNzZXRzL2pzL21vZHVsZXMvYWdlbmRhL0FnZW5kYUluaXQuanMiLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSw2QkFBNkIsbUdBQU8sZUFBZSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ2pFO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBOztBQUVPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBOztBQUVPO0FBQ1A7QUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL3dvcmtzcGFjZS1jbGllbnQvLi9wdWJsaWMvYXNzZXRzL2pzL21vZHVsZXMvYWdlbmRhL0FnZW5kYUluaXQuanM/Zjg4YyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEFnZW5kYUluaXQuanMgLSBHZXN0aW9ubmFpcmUgZCdpbml0aWFsaXNhdGlvbi9jbGVhbnVwIHBvdXIgbCdhZ2VuZGFcbiAqIFBlcm1ldCBkZSBjaGFyZ2VyIGV0IGTDqWNoYXJnZXIgbCdhZ2VuZGEgZGUgbWFuacOocmUgcHJvcHJlXG4gKi9cblxubGV0IGFnZW5kYU1vZHVsZSA9IG51bGw7XG5sZXQgYWdlbmRhSW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGluaXRBZ2VuZGEoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gw4l2aXRlciBsZXMgZG91YmxlcyBpbml0aWFsaXNhdGlvbnNcbiAgICAgICAgaWYgKGFnZW5kYUluaXRpYWxpemVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygn4pqg77iPIEFnZW5kYSBkw6lqw6AgaW5pdGlhbGlzw6knKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoYXJnZXIgbGUgbW9kdWxlIGFnZW5kYS5qcyBkeW5hbWlxdWVtZW50XG4gICAgICAgIC8vIEFqb3V0ZXIgdW4gdGltZXN0YW1wIHBvdXIgZm9yY2VyIGxlIHJlY2hhcmdlbWVudCBkdSBjYWNoZVxuICAgICAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgYWdlbmRhTW9kdWxlID0gYXdhaXQgaW1wb3J0KGAuL2FnZW5kYS5qcz90PSR7dGltZXN0YW1wfWApO1xuICAgICAgICBcbiAgICAgICAgYWdlbmRhSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJldXIgbG9ycyBkZSBsXFwnaW5pdGlhbGlzYXRpb24gZGUgbFxcJ2FnZW5kYTonLCBlcnJvcik7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVzdHJveUFnZW5kYSgpIHtcbiAgICB0cnkge1xuICAgICAgICAvLyBOZXR0b3llciBsZXMgcsOpZsOpcmVuY2VzXG4gICAgICAgIGFnZW5kYU1vZHVsZSA9IG51bGw7XG4gICAgICAgIGFnZW5kYUluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgICAgIFxuICAgICAgICAvLyBOZXR0b3llciBsZXMgZXZlbnQgbGlzdGVuZXJzIHNpIG7DqWNlc3NhaXJlXG4gICAgICAgIC8vIChhZ2VuZGEuanMgZ8OpcmVyYSBzb24gcHJvcHJlIGNsZWFudXAgcydpbCB5IGEgdW5lIGZvbmN0aW9uIGRlc3Ryb3kpXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycmV1ciBsb3JzIGRlIGxhIGRlc3RydWN0aW9uIGRlIGxcXCdhZ2VuZGE6JywgZXJyb3IpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWdlbmRhSW5pdGlhbGl6ZWQoKSB7XG4gICAgcmV0dXJuIGFnZW5kYUluaXRpYWxpemVkO1xufVxuIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///./public/assets/js/modules/agenda/AgendaInit.js\n\n}");

/***/ })

}]);