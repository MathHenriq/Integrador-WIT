-- =====================================================================
--
--   PROJETO INTEGRADOR · NÚCLEO WIT
--   Atualização 32: junta os projetos repetidos do catálogo
--
--   Cole no SQL Editor DEPOIS da 0031. Pode rodar quantas vezes quiser.
--
-- =====================================================================
--
-- O registro só reaproveitava a atividade do catálogo quando o tema vinha
-- escrito igual. Bastava a equipe escrever o mesmo projeto com outras
-- palavras — "Desenhando em Pixel Art", "Criação de Pixel Arts",
-- "CRIAÇÃO DE PERSONAGENS COM PIXEL ART" — para nascer uma atividade nova,
-- e a vitrine mostrar cinco projetos onde havia um. A tela de registro
-- agora sugere o tema que já existe e pede confirmação antes de salvar;
-- esta migration arruma o que já tinha entrado.
--
-- Quem é igual a quem foi decidido olhando o conteúdo, não por
-- semelhança de texto: a lista está escrita abaixo, par por par. Temas
-- parecidos que são aulas diferentes ficaram separados de propósito —
-- "MÚSICAS COM IA" (Suno) não é "Criando Musicas com MusicLab" (Chrome
-- Music Lab), "Manchetes e Fake News" não é o jornal no Canva.
--
-- O que acontece com cada repetida:
--   * as reservas passam a apontar para a atividade que fica, e o tema
--     original de cada uma fica guardado em `aula_livre`;
--   * habilidades da BNCC, anos e os campos em branco da que fica são
--     completados com os da repetida;
--   * a repetida é apagada do catálogo.
-- Reserva nenhuma é apagada: cada uma é uma aula que aconteceu.
--
-- Antes de mexer, tudo o que muda é copiado para o schema `backup`, que
-- não é exposto pela API — para desfazer, é de lá que se volta.

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.fusao_0032_aulas as
  select now() as copiado_em, a.* from public.aulas a where false;
create table if not exists backup.fusao_0032_aulas_habilidades as
  select now() as copiado_em, h.* from public.aulas_habilidades h where false;
create table if not exists backup.fusao_0032_reservas as
  select now() as copiado_em, r.id, r.aula_id, r.aula_livre from public.reservas r where false;

do $$
declare
  v_par   record;
  v_fica  public.aulas;
  v_sai   public.aulas;
begin
  for v_par in
    select * from (values
      -- Pixel Art: a que fica é a que tem matéria (Arte) e BNCC.
      ('CRIAÇÃO DE PERSONAGENS COM PIXEL ART',   'Criando Personagens com Pixel Art'),
      ('Criação de Pixel Arts',                  'Criando Personagens com Pixel Art'),
      ('Desenhando em Pixel Art',                'Criando Personagens com Pixel Art'),
      ('Artes com o Pixel Art',                  'Criando Personagens com Pixel Art'),
      -- Mesmo professor, mesma escola, mesma aula no Interland.
      ('Lições de segurança digital.',           'Lições de segurança e cidadania digital.'),
      -- Digitação no TypingClub.
      ('Coordenação Motora e Digitação com TypingClub',                       'Missão Digital: Aprendendo a Teclar Jogando'),
      ('Reforço de Informática | Digitação no Teclado',                       'Missão Digital: Aprendendo a Teclar Jogando'),
      ('Um reforço sobre o uso correto do teclado e como digitar corretamente', 'Missão Digital: Aprendendo a Teclar Jogando'),
      -- Jornal no Canva com manchete; a dos morcegos já não tinha reserva
      -- nenhuma ligada a ela (a aula dela aponta para a de cima).
      ('Manchete e Produção de Jornal Digital: Conhecendo os Morcegos', 'Jornal e Manchete: As Aulas na Minha Escola'),
      -- Mesmo tema, registros que não tinham entrado no catálogo.
      ('Projetos Videos for Change | Gravações', 'Projetos Videos for Change | Gravações')
    ) as t(repetida, fica)
  loop
    select * into v_fica
      from public.aulas
     where public._texto_chave(titulo) = public._texto_chave(v_par.fica)
     order by criado_em
     limit 1;

    if v_fica.id is null then
      raise notice 'Atividade "%" não existe; par ignorado.', v_par.fica;
      continue;
    end if;

    -- Reserva que registrou o tema repetido sem entrar no catálogo.
    insert into backup.fusao_0032_reservas
      select now(), r.id, r.aula_id, r.aula_livre
        from public.reservas r
       where r.aula_id is null
         and public._texto_chave(r.aula_livre) = public._texto_chave(v_par.repetida);

    update public.reservas r
       set aula_id = v_fica.id
     where r.aula_id is null
       and public._texto_chave(r.aula_livre) = public._texto_chave(v_par.repetida);

    -- A atividade repetida, se existir e não for a mesma que fica.
    for v_sai in
      select * from public.aulas
       where public._texto_chave(titulo) = public._texto_chave(v_par.repetida)
         and id <> v_fica.id
    loop
      insert into backup.fusao_0032_aulas select now(), v_sai.*;
      insert into backup.fusao_0032_aulas_habilidades
        select now(), h.* from public.aulas_habilidades h where h.aula_id = v_sai.id;
      insert into backup.fusao_0032_reservas
        select now(), r.id, r.aula_id, r.aula_livre from public.reservas r where r.aula_id = v_sai.id;

      -- O tema que a reserva mostrava fica guardado nela.
      update public.reservas
         set aula_livre = coalesce(aula_livre, v_sai.titulo),
             aula_id    = v_fica.id
       where aula_id = v_sai.id;

      insert into public.aulas_habilidades (aula_id, habilidade_id)
        select v_fica.id, h.habilidade_id
          from public.aulas_habilidades h
         where h.aula_id = v_sai.id
      on conflict do nothing;

      update public.aulas
         set descricao     = coalesce(descricao, v_sai.descricao),
             objetivos     = coalesce(objetivos, v_sai.objetivos),
             materiais     = coalesce(materiais, v_sai.materiais),
             materia_id    = coalesce(materia_id, v_sai.materia_id),
             anos          = (select coalesce(array_agg(distinct x order by x), '{}')
                                from unnest(anos || v_sai.anos) as x),
             atualizado_em = now()
       where id = v_fica.id
      returning * into v_fica;

      delete from public.aulas where id = v_sai.id;
    end loop;
  end loop;
end;
$$;
