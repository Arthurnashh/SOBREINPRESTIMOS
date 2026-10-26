import assert from "node:assert/strict";
import { test } from "node:test";
import { safeAuthNext } from "../lib/auth-redirect.ts";

test("preserva destinos internos de conta e administração", () => {
  for (const path of ["/conta", "/conta/emprestimo?valor=1000&parcelas=6", "/admin", "/admin/usuarios?pagina=2"]) assert.equal(safeAuthNext(path), path);
});

test("recusa redirects externos, prefixos enganosos e travessia de diretórios", () => {
  for (const path of [null, undefined, "", "https://example.com", "//example.com", "/\\example.com", "/contabilidade", "/admin-falso", "/conta/../../fora", "/conta\n", "/redefinir-senha"]) {
    assert.equal(safeAuthNext(path), "/conta");
  }
});
