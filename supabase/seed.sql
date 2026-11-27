-- Demo catalogue for local development. Runs after the migrations on `supabase db reset`.
-- Demo users, enrolments and an uploaded PDF are added by `npm run seed:dev`.

insert into public.areas (id, slug, name_pt, name_en, description_pt, description_en, color, icon, sort_order)
values
  ('a1000000-0000-4000-8000-000000000001', 'teachers', 'Professores', 'Teachers',
   'Planificar aulas, criar materiais e avaliar com o apoio da IA, do ensino básico ao secundário.',
   'Plan lessons, create materials and assess with the help of AI, from primary to secondary school.',
   'ochre', 'graduation-cap', 10),
  ('a1000000-0000-4000-8000-000000000002', 'medical-doctors', 'Médicos', 'Medical doctors',
   'Usar a IA com segurança na prática clínica: literatura, relatórios e informação para doentes.',
   'Use AI safely in clinical practice: literature, reports and patient information.',
   'ocean', 'stethoscope', 20);

insert into public.courses
  (id, slug, area_id, level_id, status, title_pt, title_en, summary_pt, summary_en,
   description_pt, description_en, duration_hours, starts_on, location, sort_order, published_at)
values
  ('c1000000-0000-4000-8000-000000000001', 'ai-in-the-classroom',
   'a1000000-0000-4000-8000-000000000001',
   (select id from public.levels where slug = 'introductory'),
   'published', 'IA na sala de aula', 'AI in the classroom',
   'Primeiros passos com assistentes de IA para preparar aulas, fichas e materiais adaptados aos seus alunos.',
   'First steps with AI assistants to prepare lessons, worksheets and materials adapted to your students.',
   E'## O que vai aprender\n\n- Perceber o que um assistente de IA faz bem e onde falha.\n- Escrever pedidos claros para obter planos de aula e fichas de trabalho.\n- Adaptar um mesmo material a diferentes níveis e necessidades.\n- Usar a IA respeitando a privacidade dos alunos.\n\n## A quem se destina\n\nProfessores do ensino básico e secundário que nunca usaram IA no seu trabalho, ou que a experimentaram sem método.\n\n## Programa\n\n1. Introdução: o que é (e o que não é) a IA generativa\n2. Planificar aulas com um assistente\n3. Criar e adaptar materiais\n4. Avaliação, ética e proteção de dados',
   E'## What you will learn\n\n- Understand what an AI assistant does well and where it fails.\n- Write clear requests to get lesson plans and worksheets.\n- Adapt the same material to different levels and needs.\n- Use AI while respecting student privacy.\n\n## Who it is for\n\nPrimary and secondary school teachers who have never used AI in their work, or who have tried it without a method.\n\n## Programme\n\n1. Introduction: what generative AI is (and is not)\n2. Planning lessons with an assistant\n3. Creating and adapting materials\n4. Assessment, ethics and data protection',
   8, '2027-02-13', 'Lisboa', 10, now()),
  ('c1000000-0000-4000-8000-000000000002', 'assessment-and-feedback-with-ai',
   'a1000000-0000-4000-8000-000000000001',
   (select id from public.levels where slug = 'advanced'),
   'published', 'Avaliação e feedback com IA', 'Assessment and feedback with AI',
   'Criar rubricas, dar feedback formativo e analisar resultados, mantendo o juízo profissional no centro.',
   'Build rubrics, give formative feedback and analyse results, keeping professional judgement at the centre.',
   E'## O que vai aprender\n\n- Construir rubricas e critérios de avaliação com apoio da IA.\n- Preparar feedback formativo mais rápido, sem perder o tom pessoal.\n- Analisar resultados de turma e identificar dificuldades comuns.',
   E'## What you will learn\n\n- Build rubrics and assessment criteria with the help of AI.\n- Prepare formative feedback faster without losing the personal tone.\n- Analyse class results and spot common difficulties.',
   12, '2027-03-20', 'Porto', 20, now()),
  ('c1000000-0000-4000-8000-000000000003', 'ai-in-clinical-practice',
   'a1000000-0000-4000-8000-000000000002',
   (select id from public.levels where slug = 'introductory'),
   'published', 'IA na prática clínica', 'AI in clinical practice',
   'Como usar assistentes de IA com segurança para resumir literatura, redigir relatórios e preparar informação para doentes.',
   'How to use AI assistants safely to summarise literature, draft reports and prepare patient information.',
   E'## O que vai aprender\n\n- Conhecer os limites dos assistentes de IA em contexto clínico.\n- Resumir e comparar literatura científica com sentido crítico.\n- Redigir rascunhos de relatórios e de informação para doentes.\n- Proteger dados de saúde ao usar estas ferramentas.',
   E'## What you will learn\n\n- Know the limits of AI assistants in a clinical setting.\n- Summarise and compare scientific literature critically.\n- Draft reports and patient information.\n- Protect health data when using these tools.',
   6, '2027-01-30', 'Coimbra', 30, now()),
  ('c1000000-0000-4000-8000-000000000004', 'ai-for-clinical-research',
   'a1000000-0000-4000-8000-000000000002',
   (select id from public.levels where slug = 'advanced'),
   'published', 'IA para investigação clínica', 'AI for clinical research',
   'Da pergunta de investigação à redação do artigo: onde a IA ajuda, onde atrapalha e como a usar com rigor.',
   'From the research question to writing the paper: where AI helps, where it gets in the way and how to use it rigorously.',
   E'## O que vai aprender\n\n- Apoiar a revisão de literatura e a extração de dados.\n- Usar a IA na análise exploratória e na redação científica.\n- Documentar o uso de IA de acordo com as normas das revistas.',
   E'## What you will learn\n\n- Support literature review and data extraction.\n- Use AI in exploratory analysis and scientific writing.\n- Document the use of AI in line with journal policies.',
   10, '2027-04-17', 'Online', 40, now()),
  -- One draft (trainers only) and one unlisted course (enrolled learners only) to show the statuses.
  ('c1000000-0000-4000-8000-000000000005', 'ai-for-school-leaders',
   'a1000000-0000-4000-8000-000000000001',
   (select id from public.levels where slug = 'introductory'),
   'draft', 'IA para direções escolares', 'AI for school leaders',
   null, null, null, null, null, '2027-05-08', 'Braga', 50, null),
  ('c1000000-0000-4000-8000-000000000006', 'ai-in-the-classroom-private-edition',
   'a1000000-0000-4000-8000-000000000001',
   (select id from public.levels where slug = 'introductory'),
   'unlisted', 'IA na sala de aula (edição interna)', 'AI in the classroom (private edition)',
   'Edição à medida para uma escola, visível apenas para os formandos inscritos.',
   'A tailored edition for one school, visible only to its enrolled learners.',
   null, null, 8, '2027-02-06', 'Setúbal', 60, null);

insert into public.modules (id, course_id, title_pt, title_en, sort_order)
values
  ('d1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Introdução', 'Introduction', 10),
  ('d1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'Planificar aulas', 'Planning lessons', 20),
  ('d1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'Criar e adaptar materiais', 'Creating and adapting materials', 30),
  ('d1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'Avaliação, ética e dados', 'Assessment, ethics and data', 40),
  ('d1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000003', 'Introdução', 'Introduction', 10);

insert into public.materials
  (id, module_id, kind, title_pt, title_en, description_pt, content_language, is_published,
   url, body_pt, body_en, sort_order)
values
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'video',
   'Vídeo de exemplo', 'Example video',
   'Um vídeo público, usado aqui apenas para mostrar como os vídeos aparecem.', 'en', true,
   'https://www.youtube.com/watch?v=aqz-KE-bpKQ', null, null, 20),
  ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'link',
   'Leitura recomendada', 'Recommended reading',
   'Artigo de enciclopédia sobre IA generativa.', 'en', true,
   'https://en.wikipedia.org/wiki/Generative_artificial_intelligence', null, null, 30),
  ('e1000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'page',
   'Guia de prompts', 'Prompt guide', null, null, true, null,
   E'Um bom pedido a um assistente de IA tem quatro partes. Não precisa de as usar sempre, mas quanto mais contexto der, melhor será a resposta.\n\n## As quatro partes\n\n1. **Papel.** Diga quem o assistente deve ser.\n2. **Contexto.** Descreva a turma, o tema e o objetivo.\n3. **Tarefa.** Peça uma coisa concreta.\n4. **Formato.** Indique como quer receber a resposta.\n\n## Exemplo\n\n```prompt\nÉs um professor de Ciências do 7.º ano. Vou dar uma aula de 50 minutos sobre o ciclo da água a uma turma de 24 alunos. Cria um plano de aula com três atividades e indica o tempo de cada uma. Apresenta o resultado numa tabela.\n```\n\n> **Reveja sempre a resposta.** O assistente pode errar factos ou inventar referências.',
   E'A good request to an AI assistant has four parts. You do not need all of them every time, but the more context you give, the better the answer.\n\n## The four parts\n\n1. **Role.** Say who the assistant should be.\n2. **Context.** Describe the class, the topic and the goal.\n3. **Task.** Ask for one concrete thing.\n4. **Format.** Say how you want the answer.\n\n## Example\n\n```prompt\nYou are a Year 7 science teacher. I am teaching a 50-minute lesson on the water cycle to a class of 24 students. Create a lesson plan with three activities and the time for each. Present the result as a table.\n```\n\n> **Always review the answer.** The assistant can get facts wrong or invent references.',
   40),
  ('e1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001', 'page',
   'Notas do formador (rascunho)', null, null, null, false, null,
   E'Material ainda oculto: os formandos não o veem.', null, 50),
  ('e1000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000002', 'page',
   'Plano de aula modelo', 'Sample lesson plan', null, null, true, null,
   E'## Estrutura sugerida\n\n| Momento | Tempo | Atividade |\n| --- | --- | --- |\n| Abertura | 10 min | Pergunta de partida e levantamento de ideias |\n| Desenvolvimento | 30 min | Trabalho em pares com guião |\n| Fecho | 10 min | Síntese e bilhete de saída |',
   E'## Suggested structure\n\n| Stage | Time | Activity |\n| --- | --- | --- |\n| Opening | 10 min | Starter question and gathering ideas |\n| Main part | 30 min | Pair work with a guide |\n| Closing | 10 min | Summary and exit ticket |',
   10);

-- Every course above already has the edition it was created with ("Edição geral"). The first
-- course gets a second one: a dated class, shown on its public page. Its dates move with the
-- day the database is built, so it is always still to come.
insert into public.editions (id, course_id, name_pt, name_en, starts_on, ends_on, is_listed)
values
  ('ed100000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'Turma presencial', 'In-person class', current_date + 42, current_date + 98, true);

-- That class has a page of its own, and does not get the recommended reading.
insert into public.materials
  (id, module_id, kind, title_pt, title_en, is_published, body_pt, body_en, sort_order, edition_id)
values
  ('e1000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000001', 'page',
   'Horário das sessões', 'Session timetable', true,
   E'As sessões presenciais decorrem às terças-feiras, das 18h00 às 20h00, na sala 2.',
   E'The in-person sessions take place on Tuesdays, from 6 pm to 8 pm, in room 2.',
   60, 'ed100000-0000-4000-8000-000000000001');

insert into public.edition_hidden_materials (edition_id, material_id)
values ('ed100000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003');
