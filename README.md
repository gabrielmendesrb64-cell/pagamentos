# Recebíveis — Controle Privado

Painel pessoal e privado para controlar valores a receber, pagamentos parciais e comprovantes.

## Dados iniciais

- Vinicius — dívida original: R$ 29.000,00 — saldo inicial: R$ 29.000,00
- Guilherme — dívida original: R$ 13.000,00 — já pago: R$ 1.000,00 — saldo inicial: R$ 12.000,00
- Paulo — dívida original: R$ 800,00 — já pago: R$ 350,00 — saldo inicial: R$ 450,00
- Total inicial a receber: R$ 41.450,00

## Recursos

- Login único e privado, sem cadastro público
- Área **Minha conta**
- Alteração do usuário de login pelo próprio painel
- Alteração de senha exigindo a senha atual
- Senha armazenada em hash com `scrypt` + salt, não em texto puro no banco
- Ao trocar a senha, outras sessões abertas são encerradas
- Opção manual para encerrar outros acessos
- Dashboard profissional de recebíveis
- Saldo calculado automaticamente
- Pagamentos parciais e histórico individual
- Upload de comprovantes JPG, PNG, WEBP ou PDF
- Galeria privada de comprovantes
- Busca por pessoa
- Edição de cadastro
- Exclusão de pagamento lançado incorretamente
- Backup dos registros
- Layout responsivo para computador e celular
- Endpoint `/health` para verificação da hospedagem

## Primeiro login

No **primeiro início**, a conta administrativa é criada usando:

- `ADMIN_USER`
- `ADMIN_PASSWORD`

Depois disso, o usuário e a senha podem ser trocados dentro de **Minha conta**. As novas credenciais ficam salvas no banco de dados.

> Se o banco de dados for apagado ou recriado, o sistema volta a criar a conta usando `ADMIN_USER` e `ADMIN_PASSWORD` do ambiente.

## Render

Use:

**Build Command**
`npm install`

**Start Command**
`npm start`

Variáveis de ambiente:

- `NODE_VERSION=22.16.0`
- `NODE_ENV=production`
- `ADMIN_USER=admin`
- `ADMIN_PASSWORD=SUA_SENHA_INICIAL_FORTE`
- `SESSION_SECRET=UMA_CHAVE_GRANDE_COM_PELO_MENOS_32_CARACTERES`

Depois de alterar arquivos ou a versão do Node no Render, use **Manual Deploy > Clear build cache & deploy**.

## Importante sobre o Render gratuito

O projeto usa SQLite e salva comprovantes em disco. Em hospedagens com armazenamento temporário, um novo deploy ou reinicialização pode apagar o banco e os comprovantes. Nesse caso, inclusive o usuário/senha alterados dentro de **Minha conta** voltariam aos valores iniciais das variáveis de ambiente.

Para uso permanente, use armazenamento persistente ou migre banco e comprovantes para um serviço externo.
