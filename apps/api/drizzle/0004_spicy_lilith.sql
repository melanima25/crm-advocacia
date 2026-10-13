CREATE TYPE "public"."status_tarefa" AS ENUM('a_fazer', 'fazendo', 'feito');--> statement-breakpoint
CREATE TABLE "tarefa" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"processo_id" integer,
	"responsavel_id" integer NOT NULL,
	"status" "status_tarefa" DEFAULT 'a_fazer' NOT NULL,
	"vence_em" date,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_processo_id_processo_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tarefa_responsavel_idx" ON "tarefa" USING btree ("responsavel_id");--> statement-breakpoint
CREATE INDEX "tarefa_status_idx" ON "tarefa" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tarefa_processo_idx" ON "tarefa" USING btree ("processo_id");