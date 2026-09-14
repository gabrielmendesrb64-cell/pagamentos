# Controle de Dívidas — Painel Pessoal

Painel privado para acompanhar pessoas que devem dinheiro, registrar pagamentos parciais e guardar comprovantes.

## Dados iniciais já cadastrados

- Vinicius: dívida de R$ 29.000,00; pago R$ 0,00; saldo R$ 29.000,00.
- Guilherme: dívida de R$ 13.000,00; pago R$ 1.000,00; saldo R$ 12.000,00.
- Paulo: dívida de R$ 800,00; pago R$ 350,00; saldo R$ 450,00.
- Total inicial a receber: R$ 41.450,00.

Os pagamentos já informados de Guilherme e Paulo entram como registros iniciais sem inventar uma data de pagamento.

## Recursos

- Login único, sem cadastro público.
- Resumo com valor original, recebido e saldo pendente.
- Ficha individual de cada pessoa.
- Pagamentos parciais com cálculo automático do saldo.
- Histórico de pagamentos.
- Comprovantes em JPG, PNG, WEBP ou PDF (até 8 MB).
- Comprovante pode ser anexado no pagamento ou depois.
- Visualização e remoção de comprovantes.
- Correção/exclusão de pagamentos com recálculo automático.
- Cadastro de novas pessoas.
- Edição de nome, valor original e observações.
- Backup dos dados em JSON.
- Interface responsiva para celular e computador.

## Como abrir no seu computador

1. Instale o Node.js 20 ou mais recente.
2. Abra o terminal dentro desta pasta.
3. Rode:

```bash
npm install
npm start
```

4. Abra `http://localhost:3000` no navegador.

## Login inicial

Os dados estão no arquivo `.env`.

- Usuário: `admin`
- Senha inicial: `Dividas@2026!`

**Troque a senha antes de colocar o site na internet.** Altere `ADMIN_PASSWORD` e também gere um novo valor grande para `SESSION_SECRET`.

## Banco de dados e comprovantes

Por padrão tudo fica dentro da pasta `data/`:

- `data/controle-dividas.db`: banco SQLite.
- `data/uploads/`: comprovantes.
- As sessões de login ficam protegidas no próprio banco SQLite.

A pasta `data/` está no `.gitignore` para não enviar informações pessoais ao GitHub por acidente.

## Se for hospedar no Render

O sistema foi preparado para usar a variável `DATA_DIR`. Para não perder banco e comprovantes após reinicializações, use armazenamento persistente e aponte `DATA_DIR` para esse disco (por exemplo, `/var/data`).

Sem disco persistente, serviços com sistema de arquivos temporário podem apagar o SQLite e os comprovantes quando a instância reiniciar. Para uso permanente, não dependa de armazenamento efêmero.

Configure no painel da hospedagem:

- `NODE_ENV=production`
- `ADMIN_USER=seu_usuario`
- `ADMIN_PASSWORD=uma_senha_forte`
- `SESSION_SECRET=uma_chave_longa_e_aleatoria`
- `DATA_DIR=/caminho/do/disco/persistente`

Nunca publique o arquivo `.env`.
