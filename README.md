# Hermes-orquestrador

## Como fazer commit das alterações

1. Verifique os arquivos modificados:
   ```bash
   git status -sb
   ```
2. Selecione os arquivos que devem entrar no commit:
   ```bash
   git add caminho/do/arquivo
   # ou para adicionar tudo:
   git add .
   ```
3. Confira novamente se só os arquivos desejados estão na área de staging:
   ```bash
   git status -sb
   ```
4. Registre o commit com uma mensagem descritiva (em português ou inglês, conforme o padrão do time):
   ```bash
   git commit -m "Descrição breve da alteração"
   ```
5. Caso precise alterar o último commit antes de enviá-lo, é possível ajustar com:
   ```bash
   git commit --amend
   ```
6. Por fim, envie o commit para o repositório remoto:
   ```bash
   git push origin nome-do-branch
   ```

> Dica: procure manter mensagens de commit objetivas, explicando rapidamente o que foi alterado e o motivo quando necessário.
